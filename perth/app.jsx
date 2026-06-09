// ============================================================
//  PERTH — APP ROOT
// ============================================================
function Masthead() {
  return (
    <header className="masthead">
      <div className="sheet-bar">
        <span>Ordnance Almanac · Sheet PER · <span className="dot">●</span> The Fair City</span>
        <span>Lat 56.40°N · Long 3.43°W · River Tay</span>
        <span>Eight centuries · one river</span>
      </div>
      <div className="hero">
        <div className="hero-left">
          <span className="kicker">A survey of a Scottish town</span>
          <h1>Perth<br/><em>on the&nbsp;Tay</em></h1>
          <p className="gaelic">Peairt — "the wood by the water"</p>
          <p className="sub">From a walled medieval burgh to a city of estates, ring roads and retail sheds — traced on a map that grows before your eyes. The railways that made it a junction, the bypass that remade its edges, and the supermarkets that rewrote its weekly shop.</p>
          <dl className="hero-stats">
            <div><dt>Founded</dt><dd>c.1124 <small>royal burgh</small></dd></div>
            <div><dt>On the</dt><dd>River Tay <small>west bank</small></dd></div>
            <div><dt>Railways met</dt><dd>5 <small>companies, c.1885</small></dd></div>
            <div><dt>City again</dt><dd>2012 <small>Diamond Jubilee</small></dd></div>
          </dl>
          <div className="scale-strip">
            <span>0</span>
            <div className="scale-bar"><span></span><span></span><span></span><span></span></div>
            <span>1 km (approx)</span>
          </div>
        </div>
        <div className="hero-right">
          <KeyMap />
          <div className="hero-corner">Index map · present day</div>
        </div>
      </div>
    </header>
  );
}

function MapIntro() {
  return (
    <section className="section" id="map">
      <div className="section-head">
        <div className="sh-num">CENTREPIECE</div>
        <h2>Watch the city <em>grow</em></h2>
        <p className="sh-lede">Drag the slider — or press play — to build Perth from its medieval core. The streets fill in, the railways open and close, the bypass swings west, and the retail parks drop onto the edges. Each year brings its own events into the panel beside the map.</p>
      </div>
      <Atlas />
    </section>
  );
}

function App() {
  return (
    <div className="root">
      <Masthead />
      <MapIntro />
      <Origins />
      <Industrial />
      <Railways />
      <Expansion />
      <Timeline />
      <Retail />
      <Today />
      <Colophon />
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("app")).render(<App />);
