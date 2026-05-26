// Animated map of the ECML — UK east coast silhouette + line build-up by year
const { useMemo, useState, useEffect, useRef } = React;

// Rough UK east-side silhouette. Hand-drawn from a map; deliberately stylised.
// Width 500, height 800
const UK_PATH = `
M 295 92 L 305 78 L 318 70 L 332 64 L 348 60 L 360 60 L 370 64 L 380 75
L 388 88 L 400 92 L 410 84 L 422 80 L 432 85 L 438 100 L 432 115 L 422 120
L 414 130 L 422 140 L 432 155 L 438 170 L 438 188 L 432 205 L 424 222
L 420 240 L 422 258 L 420 278 L 416 296 L 415 314 L 414 332 L 412 350
L 410 368 L 408 386 L 400 402 L 392 420 L 388 438 L 386 456 L 388 474
L 392 492 L 396 510 L 398 528 L 396 546 L 390 562 L 386 580 L 384 598
L 388 616 L 392 634 L 396 652 L 398 670 L 394 686 L 388 700 L 380 712
L 372 724 L 366 736 L 360 748 L 354 760 L 352 770 L 358 776 L 372 778
L 388 776 L 402 768 L 416 758 L 426 748 L 432 736 L 428 720 L 418 706
L 410 690 L 408 672 L 412 654 L 418 638 L 422 620 L 422 600 L 418 580
L 414 560 L 412 540 L 414 520 L 416 500 L 418 480 L 416 460 L 412 440
L 408 420 L 412 402 L 418 384 L 426 366 L 428 348 L 426 330 L 422 312
L 426 294 L 432 276 L 438 258 L 444 240 L 448 222 L 448 204 L 444 186
L 446 168 L 448 150 L 446 132 L 440 116 L 432 102 L 422 92 L 408 88
`;

// Build the route as a polyline through the stations (south→north)
function MapView({ year, onStationClick, focusStation, withCompanies = true, markers = [], hoveredMarker = null }) {
  const stations = window.ECML.STATIONS;
  const companies = window.ECML.COMPANIES;

  // Order south→north for the polyline
  const south2north = useMemo(() => [...stations].sort((a,b) => b.y - a.y), [stations]);

  // Build a clean polyline through the stations — railways don't wobble.
  const routeD = useMemo(() => {
    const pts = south2north.map(s => [s.x, s.y]);
    if (pts.length < 2) return '';
    let d = `M ${pts[0][0]} ${pts[0][1]}`;
    for (let i = 1; i < pts.length; i++) {
      d += ` L ${pts[i][0]} ${pts[i][1]}`;
    }
    return d;
  }, [south2north]);

  // Segments — each tagged with the year it was through-running and which company
  // (drawing from south to north along the path, fractions)
  const SEGMENTS = useMemo(() => ([
    // London → Peterborough  (GNR 1850)
    { from: 'kgx', to: 'ptb', year: 1850, company: 'gnr' },
    // Peterborough → Doncaster (GNR 1850/1852)
    { from: 'ptb', to: 'dnc', year: 1850, company: 'gnr' },
    // Doncaster → York (initially via Knottingley 1850; direct via Selby 1871)
    { from: 'dnc', to: 'yrk', year: 1850, company: 'gnr' },
    // York → Darlington (1841)
    { from: 'yrk', to: 'dar', year: 1841, company: 'ner' },
    // Darlington → Newcastle (1844)
    { from: 'dar', to: 'ncl', year: 1844, company: 'ner' },
    // Newcastle → Berwick (1847)
    { from: 'ncl', to: 'ber', year: 1847, company: 'ner' },
    // Berwick gap closed by Royal Border Bridge — 1850
    { from: 'ber', to: 'ber', year: 1850, company: 'ner', bridge: true },
    // Berwick → Edinburgh (1846 NBR; through running 1850)
    { from: 'ber', to: 'edi', year: 1846, company: 'nbr' },
  ]), []);

  const stById = useMemo(() => Object.fromEntries(stations.map(s => [s.id, s])), [stations]);

  // For each pair, slice the path between the two stations
  // We'll compute by finding the t value along the path corresponding to each station.
  // Cheap trick: use a hidden <path> and getPointAtLength.
  const pathRef = useRef(null);
  const [stationT, setStationT] = useState(null);

  useEffect(() => {
    if (!pathRef.current) return;
    const total = pathRef.current.getTotalLength();
    // For each station find the closest length along the path.
    const result = {};
    for (const s of stations) {
      let bestL = 0, bestDist = Infinity;
      const N = 600;
      for (let i = 0; i <= N; i++) {
        const L = (i / N) * total;
        const p = pathRef.current.getPointAtLength(L);
        const dx = p.x - s.x, dy = p.y - s.y;
        const d2 = dx*dx + dy*dy;
        if (d2 < bestDist) { bestDist = d2; bestL = L; }
      }
      result[s.id] = bestL;
    }
    result.__total = total;
    setStationT(result);
  }, [stations]);

  // For drawing the build-up:
  // Find revealed segments for current year, draw each in its company colour.
  const visibleSegments = useMemo(() => {
    if (!stationT) return [];
    return SEGMENTS.filter(seg => seg.year <= year && !seg.bridge).map(seg => {
      const L1 = stationT[seg.from];
      const L2 = stationT[seg.to];
      const lo = Math.min(L1, L2), hi = Math.max(L1, L2);
      return { ...seg, lo, hi };
    });
  }, [SEGMENTS, stationT, year]);

  // Visible stations: a station appears once a segment touching it is open OR its own opened year ≤ year
  const visibleStationIds = useMemo(() => {
    const set = new Set();
    for (const s of stations) {
      if (s.opened <= year) set.add(s.id);
    }
    return set;
  }, [stations, year]);

  const companyById = useMemo(() => Object.fromEntries(companies.map(c => [c.id, c])), [companies]);

  // Royal Border Bridge spark
  const showBorderBridge = year >= 1850;

  return (
    <svg viewBox="0 0 500 800" className="ecml-map" preserveAspectRatio="xMidYMid meet">
      <defs>
        <pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="6" stroke="rgba(40,30,20,0.10)" strokeWidth="0.5"/>
        </pattern>
      </defs>

      {/* The sea / paper */}
      <rect width="500" height="800" fill="var(--paper)"/>

      {/* Subtle latitude grid */}
      <g stroke="rgba(40,30,20,0.06)" strokeWidth="0.5">
        {[100, 200, 300, 400, 500, 600, 700].map(y => (
          <line key={y} x1="20" y1={y} x2="480" y2={y}/>
        ))}
        {[100, 200, 300, 400].map(x => (
          <line key={x} x1={x} y1="40" x2={x} y2="780"/>
        ))}
      </g>

      {/* North arrow */}
      <g transform="translate(60, 80)">
        <line x1="0" y1="-22" x2="0" y2="22" stroke="#1a1410" strokeWidth="1"/>
        <polygon points="0,-26 -5,-12 5,-12" fill="#1a1410"/>
        <text x="0" y="-32" textAnchor="middle" fontSize="9" fill="#1a1410" fontFamily="'JetBrains Mono', monospace">N</text>
      </g>

      {/* Tweed border */}
      <line x1="245" y1="195" x2="430" y2="173" stroke="rgba(168,40,40,0.5)" strokeWidth="0.8" strokeDasharray="2 3"/>
      <text x="20" y="178" className="map-label" fill="#7a5b3f" fontSize="9" fontFamily="'JetBrains Mono', monospace">SCOTLAND</text>
      <text x="20" y="194" className="map-label" fill="#7a5b3f" fontSize="9" fontFamily="'JetBrains Mono', monospace">ENGLAND</text>

      {/* Coast hint — a faint vertical "coastline" suggestion on the right edge */}
      <path
        d="M 410 60 Q 400 200 395 320 Q 390 440 400 560 Q 406 660 410 760"
        fill="none"
        stroke="rgba(40,30,20,0.12)"
        strokeWidth="0.8"
        strokeDasharray="4 4"
      />
      <text x="420" y="420" fontSize="9" fill="#a08866" fontFamily="'JetBrains Mono', monospace" transform="rotate(90 420 420)">NORTH SEA</text>

      {/* Hidden path used for measurement */}
      <path ref={pathRef} d={routeD} fill="none" stroke="none" />

      {/* Faint ghost of the full route */}
      <path d={routeD} fill="none" stroke="rgba(40,30,20,0.10)" strokeWidth="1" strokeDasharray="2 4" />

      {/* Drawn segments — clipped via stroke-dasharray trick */}
      {stationT && visibleSegments.map((seg, i) => {
        const c = companyById[seg.company]?.colour || '#444';
        const total = stationT.__total;
        const before = seg.lo;
        const len = seg.hi - seg.lo;
        return (
          <path
            key={i}
            d={routeD}
            fill="none"
            stroke={c}
            strokeWidth="2.6"
            strokeLinecap="round"
            strokeDasharray={`0 ${before} ${len} ${total}`}
            style={{ transition: 'stroke 0.6s ease' }}
          />
        );
      })}

      {/* Border-bridge sparkle */}
      {showBorderBridge && (
        <g>
          <circle cx="327" cy="188" r="6" fill="none" stroke="#a82828" strokeWidth="1.4">
            <animate attributeName="r" values="4;12;4" dur="2.4s" repeatCount="indefinite"/>
            <animate attributeName="opacity" values="1;0;1" dur="2.4s" repeatCount="indefinite"/>
          </circle>
        </g>
      )}

      {/* Stations */}
      {stations.map(s => {
        const on = visibleStationIds.has(s.id);
        const focused = focusStation === s.id;
        return (
          <g key={s.id} className="station-g" onClick={() => onStationClick && onStationClick(s.id)} style={{ cursor: 'pointer' }}>
            <circle cx={s.x} cy={s.y} r={focused ? 5 : 3} fill={on ? '#1a1410' : '#cbbfa6'} stroke="#f4ede0" strokeWidth="1.2"/>
            {(focused || ['kgx','yrk','ncl','edi','dnc','ptb','ber','dar'].includes(s.id)) && (
              <text
                x={s.side === 'L' ? s.x - 8 : s.x + 8}
                y={s.y + 3.5}
                textAnchor={s.side === 'L' ? 'end' : 'start'}
                className="station-label"
                fontSize="9.5"
                fill="#1a1410"
                fontFamily="'JetBrains Mono', monospace"
              >
                {s.name.replace('London ','').replace(' Waverley','').replace(' North Gate','')}
              </text>
            )}
          </g>
        );
      })}

      {/* Event markers — pulsing dots at the location of recent events */}
      {markers.map((m, i) => {
        const s = stations.find(st => st.id === m.loc);
        if (!s) return null;
        const isHovered = hoveredMarker === m.key;
        const isNewest = i === 0;
        const opacity = isHovered ? 1 : (isNewest ? 0.95 : 0.5 - i * 0.08);
        const r = isHovered ? 9 : (isNewest ? 7 : 5);
        return (
          <g key={m.key}>
            {/* Pulse only on newest */}
            {isNewest && (
              <circle cx={s.x} cy={s.y} r={r} fill="none" stroke="#a82828" strokeWidth="1.4" opacity="0.8">
                <animate attributeName="r" values={`${r};${r+14};${r}`} dur="2.6s" repeatCount="indefinite"/>
                <animate attributeName="opacity" values="0.9;0;0.9" dur="2.6s" repeatCount="indefinite"/>
              </circle>
            )}
            <circle cx={s.x} cy={s.y} r={r} fill="#a82828" opacity={opacity} stroke="#f4ede0" strokeWidth="1.5"/>
            {(isHovered || isNewest) && (
              <g>
                <line
                  x1={s.x} y1={s.y}
                  x2={s.side === 'L' ? s.x - 14 : s.x + 14}
                  y2={s.y - 18}
                  stroke="#a82828" strokeWidth="0.8"
                />
                <text
                  x={s.side === 'L' ? s.x - 16 : s.x + 16}
                  y={s.y - 18}
                  textAnchor={s.side === 'L' ? 'end' : 'start'}
                  fontSize="9.5"
                  fontFamily="'JetBrains Mono', monospace"
                  fill="#a82828"
                >
                  {m.year}
                </text>
              </g>
            )}
          </g>
        );
      })}

      {/* Company legend strips down the right */}
      {withCompanies && (
        <g transform="translate(10, 720)">
          {companies.map((c, i) => (
            <g key={c.id} transform={`translate(${i*150}, 0)`}>
              <rect width="20" height="3" fill={c.colour}/>
              <text x="26" y="5" fontSize="9" fill="#1a1410" fontFamily="'JetBrains Mono', monospace">{c.short}</text>
            </g>
          ))}
        </g>
      )}
    </svg>
  );
}

window.MapView = MapView;
