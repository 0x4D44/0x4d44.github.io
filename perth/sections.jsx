// ============================================================
//  PERTH — EDITORIAL SECTIONS
// ============================================================
const PD = window.PERTH;

function SectionHead({ n, title, em, lede }) {
  return (
    <div className="section-head">
      <div className="sh-num">{n}</div>
      <h2>{title} {em && <em>{em}</em>}</h2>
      {lede && <p className="sh-lede">{lede}</p>}
    </div>
  );
}

// ---------- Origins ----------
function Origins() {
  return (
    <section className="section" id="origins">
      <SectionHead n="SHEET 01" title="A toun at the" em="river crossing"
        lede="Perth exists because of one fact of geography: the lowest point at which the Tay could be bridged was also the highest a sea-going ship could reach. Trade and a river crossing met on a slight gravel rise — and a town was inevitable." />
      <div className="split">
        <div className="prose">
          <p className="lead firstcap">The name is older than the burgh. <em>Perth</em> comes from a Pictish word for a wood or thicket; people had lived and crossed here for thousands of years before any charter — Mesolithic hunters, Bronze-Age boat-builders on the Tay mudflats, and a Roman fort downstream at Carpow.</p>
          <p>Two miles north-east lay Scone, the inauguration place of the Kings of Scots and home, until 1296, of the Stone of Destiny. That royal weight pulled importance onto the little trading settlement beside the river. By the early twelfth century David I had made Perth a <strong>royal burgh</strong>, and within a century it was among the richest in the kingdom — its hammermen and glovers organised into guilds, its merchants trading silk, wine and pottery with France, the Low Countries and the Baltic.</p>
          <p className="dropline">The flood of 1210</p>
          <p>The Tay has always been the maker and the wrecker of Perth. In 1210 a great flood swept away the royal castle and much of the town; William the Lion refounded the burgh, and the medieval street plan that grew back — the gaits and narrow vennels between South Street and the river — is still legible in the modern city centre.</p>
          <p>Behind its walls — the strongest of any Scottish town in the Middle Ages — Perth held four religious houses: the Blackfriars, the Greyfriars, the Whitefriars at Tullilum and Scotland's only Carthusian charterhouse. None survive above ground. In May 1559 John Knox preached against idolatry in St John's Kirk and the friaries were ransacked within hours. Their names are all that is left, carried by the streets.</p>
        </div>
        <aside className="rail">
          <h4>Burgh at a glance</h4>
          <dl>
            <div className="kv"><dt>Founded</dt><dd>Royal burgh under David I, early 12th c.</dd></div>
            <div className="kv"><dt>Site</dt><dd>West bank of the Tay, on a low gravel terrace</dd></div>
            <div className="kv"><dt>Name</dt><dd>Pictish, "wood / thicket"; long called St John's Toun</dd></div>
            <div className="kv"><dt>Role</dt><dd>Effective capital of Scots until c.1452</dd></div>
            <div className="kv"><dt>Trade</dt><dd>Wool, hides, leather; imports of wine &amp; silk</dd></div>
          </dl>
        </aside>
      </div>
    </section>
  );
}

// ---------- Georgian / Victorian industrial ----------
function Industrial() {
  return (
    <section className="section" id="industrial">
      <SectionHead n="SHEET 02" title="Bridges, linen &amp;" em="the Georgian town"
        lede="For five centuries the town stayed inside the line of its walls. The bridge, the parks and the first industries finally pushed it outward." />
      <div className="prose">
        <p className="lead">The Tay refused to be bridged for generations — a bridge of 1616 lasted five years before the floods took it. Only in 1771 did John Smeaton's stone bridge finally hold, ending the ferries and knitting the burgh to Bridgend and the road north. Three years later the North and South Inch were laid out as public parks, and the town has kept both green frames ever since.</p>
        <p>Georgian Perth grew prosperous on <strong>linen and leather</strong>, on bleaching and on whisky, with the Academy (1760) turning out the clerks and chemists those trades needed. The walls came down in 1776 as traffic outgrew them. Population climbed from about 9,000 in the 1770s to 15,000 by 1801. In 1885 the insurer <strong>General Accident</strong> was founded on Tay Street; it would become one of Britain's largest and define white-collar Perth for a century, long before Aviva inherited its name.</p>
      </div>
    </section>
  );
}

// ---------- Railways ----------
function StationDiagram() {
  return (
    <svg viewBox="0 0 1000 300" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Schematic elevation of Perth General Station">
      <rect x="0" y="0" width="1000" height="300" fill="none" />
      {/* ground */}
      <line x1="20" y1="262" x2="980" y2="262" stroke="var(--ink)" strokeWidth="1.5" />
      {/* great train-shed roof (arched) */}
      <path d="M 250 262 L 250 150 Q 250 90 320 88 L 680 88 Q 750 90 750 150 L 750 262" fill="none" stroke="var(--ink)" strokeWidth="2" />
      <path d="M 268 150 Q 268 108 322 106 L 678 106 Q 732 108 732 150" fill="none" stroke="var(--rule)" strokeWidth="1" />
      {/* glazing bars */}
      {Array.from({length:13}).map((_,i)=>(<line key={i} x1={300+i*32} y1="100" x2={300+i*32} y2="150" stroke="var(--rule)" strokeWidth="0.7" />))}
      {/* platform canopies */}
      <path d="M 120 200 L 250 200 L 250 215 L 120 215 Z" fill="var(--paper-2)" stroke="var(--ink)" strokeWidth="1.2" />
      <path d="M 750 200 L 880 200 L 880 215 L 750 215 Z" fill="var(--paper-2)" stroke="var(--ink)" strokeWidth="1.2" />
      <line x1="160" y1="215" x2="160" y2="262" stroke="var(--ink)" strokeWidth="1" />
      <line x1="840" y1="215" x2="840" y2="262" stroke="var(--ink)" strokeWidth="1" />
      {/* clock / Tite frontage tower */}
      <rect x="470" y="40" width="60" height="48" fill="var(--paper-2)" stroke="var(--ink)" strokeWidth="1.5" />
      <circle cx="500" cy="64" r="10" fill="var(--paper)" stroke="var(--ink)" strokeWidth="1.2" />
      <line x1="500" y1="64" x2="500" y2="57" stroke="var(--ink)" strokeWidth="1" />
      <line x1="500" y1="64" x2="505" y2="66" stroke="var(--ink)" strokeWidth="1" />
      <path d="M 466 40 L 500 22 L 534 40 Z" fill="var(--paper-2)" stroke="var(--ink)" strokeWidth="1.5" />
      {/* tracks under the shed */}
      <line x1="300" y1="262" x2="700" y2="262" stroke="var(--rail)" strokeWidth="0" />
      {[330, 420, 500, 580, 670].map((x,i)=>(<g key={i}><line x1={x-14} y1="258" x2={x+14} y2="258" stroke="var(--rail)" strokeWidth="1.4" /><line x1={x-14} y1="252" x2={x+14} y2="252" stroke="var(--rail)" strokeWidth="1.4" /></g>))}
      {/* labels */}
      <text x="500" y="288" textAnchor="middle" fontSize="12" fill="var(--ink-soft)" style={{fontFamily:"var(--mono)", letterSpacing:"2px"}}>THE GREAT TRAIN SHED · CURVED ON PLAN · OPENED 1848, REBUILT 1885–87</text>
      <text x="140" y="190" fontSize="10" fill="var(--ink-soft)" style={{fontFamily:"var(--mono)"}}>PLATFORM</text>
      <text x="788" y="190" fontSize="10" fill="var(--ink-soft)" style={{fontFamily:"var(--mono)"}}>PLATFORM</text>
    </svg>
  );
}

function Railways() {
  const [sel, setSel] = React.useState("highland");
  const line = PD.RAIL_LINES.find((l) => l.id === sel);
  return (
    <section className="section" id="railways">
      <SectionHead n="SHEET 03" title="The greatest junction" em="in the north"
        lede="For a century Perth was one of Scotland's busiest railway towns — the place where the lines from the south handed the Highlands over to the lines of the north. Five companies met here; their rivalries, summits and closures are written across the map." />
      <div className="prose">
        <p className="lead firstcap">The railway reached Perth in 1847, when the Dundee &amp; Perth line crossed the Tay from the east. A year later a shared <strong>General Station</strong> opened on the western edge of the burgh, designed by Sir William Tite with a great curved train shed. As more companies arrived it was enlarged again and again — by the 1880s a sprawling joint station worked by the Caledonian, the Highland, the North British and their partners.</p>
        <p>What made Perth matter was its position. Every train from Glasgow, Edinburgh, Stirling, Dundee and Aberdeen converged here before the single great climb north over <strong>Druimuachdar</strong> — at 1,484 feet the highest main line in Britain — to Inverness. Locomotives were changed, portions split and joined, and the platforms ran day and night. Beyond passengers lay an enormous goods trade: the marshalling yards at Friarton handled livestock, timber, coal, fish from the coast and whisky from the glens.</p>
      </div>

      <div className="lines-table">
        {PD.RAIL_LINES.map((l) => (
          <button key={l.id} className={`line-row ${l.status === "shut" ? "closed" : ""} ${sel === l.id ? "on" : ""}`} onClick={() => setSel(l.id)}>
            <span className="line-swatch" style={{ background: l.color, borderStyle: l.status === "shut" ? "dashed" : "solid" }}></span>
            <span className="line-name">{l.name}<small>{l.sub}</small></span>
            <span className="line-years">{l.years}<span className={`line-status ${l.status}`}>{l.status === "open" ? "Open" : "Closed"}</span></span>
            <span className="line-note">{l.note}</span>
          </button>
        ))}
      </div>

      <div className="station-fig">
        <StationDiagram />
        <div className="cap">
          <span>Fig. 3 — Perth General Station, schematic elevation</span>
          <span>Architect · Sir William Tite · 7 platforms at its peak</span>
        </div>
      </div>

      <div className="split" style={{ marginTop: "40px" }}>
        <div className="prose">
          <p className="dropline">The axe and after</p>
          <p>The junction shrank as fast as it had grown. Dr Beeching's 1963 report swept away Perthshire's rural web — the branches to <strong>Crieff and Comrie, Methven, Bankfoot and Alyth</strong> all closed between 1962 and 1965. In 1970 the direct line to Edinburgh through Glenfarg was sacrificed so the M90 motorway could be driven through the same narrow gap: a rare case of a railway closed expressly to build a road on its bed.</p>
          <p>Perth kept its trunk routes, and they still carry it today. ScotRail runs south to Glasgow, Edinburgh and across the Tay to Dundee and Aberdeen; the <strong>Highland Main Line</strong> climbs north to Inverness; and the <strong>Caledonian Sleeper</strong> still pauses in the small hours, splitting and joining portions on the platforms exactly as the Victorians did.</p>
        </div>
        <aside className="rail">
          <h4>{line.name}</h4>
          <dl>
            <div className="kv"><dt>Route</dt><dd>{line.sub}</dd></div>
            <div className="kv"><dt>Years</dt><dd>{line.years}</dd></div>
            <div className="kv"><dt>Status</dt><dd>{line.status === "open" ? "Operational" : "Closed & lifted"}</dd></div>
          </dl>
          <p style={{ fontSize: "14.5px", lineHeight: 1.5, color: "var(--ink-soft)", margin: "14px 0 0" }}>{line.note}</p>
        </aside>
      </div>
    </section>
  );
}

// ---------- Expansion & the bypass ----------
function Expansion() {
  return (
    <section className="section" id="expansion">
      <SectionHead n="SHEET 04" title="The edges" em="break loose"
        lede="After 1945 — and emphatically after 1970 — Perth stopped being a tight town beside a river and became a city of estates, ring roads and retail parks. The single biggest agent of that change was a road built to avoid the place altogether." />
      <div className="prose">
        <p className="lead firstcap">Postwar Perth grew outward in waves of housing: Muirton first, then Letham, Tulloch and Hillyland, each estate stepping onto the farmland that had hemmed the town for centuries. Queen's Bridge (1960) added a second central crossing as car ownership climbed. But the medieval core could not absorb the traffic now pouring up the A9 between the central belt and the Highlands — the High Street had become the trunk road.</p>
        <p className="dropline">The white paper, the funding, the road</p>
        <p>A 1970 white paper named the A9 a national priority; in May 1972 the Secretary of State announced the money, and Scotland's largest road project of the century began — the complete reconstruction of the 138 miles from Bridge of Allan to Inverness, finished in 1986 at over £200 million. At Perth the key works came early. The <strong>Friarton Bridge</strong> carried the new road high over the Tay south of the town in 1978, and the <strong>western bypass</strong> swung through traffic around the edge via the new Broxden Junction, where the A9 meets the M90 from the Forth — today one of the busiest junctions in Scotland, with links to all eight Scottish cities.</p>
        <p>The effect on the map was dramatic. Relieved of through traffic, the centre could pedestrianise; freed of the old constraints, the edges boomed. The <strong>Inveralmond</strong> industrial estate filled the northern approach, North Muirton spread along the river, and a new economic geography took hold — one organised around junctions and car parks rather than the river and the kirk.</p>
      </div>
    </section>
  );
}

// ---------- Timeline ----------
function Timeline() {
  const [cat, setCat] = React.useState("all");
  const items = cat === "all" ? PD.TIMELINE : PD.TIMELINE.filter((t) => t.cat === cat);
  return (
    <section className="section" id="timeline">
      <SectionHead n="SHEET 05" title="Eight centuries," em="in order"
        lede="The whole span on one thread — burgh and city, lines opened and lifted, estates and roads. Filter it by what you came for." />
      <div className="filters">
        {PD.TL_CATS.map((c) => (
          <button key={c.id} className={`chip ${cat === c.id ? "on" : ""}`} onClick={() => setCat(c.id)}>{c.label}</button>
        ))}
      </div>
      <ul className="timeline">
        {items.map((t, i) => (
          <li key={i} className={`tl-item cat-${t.cat}`}>
            <div className="tl-year">{t.year}</div>
            <div className="tl-dot"></div>
            <div className="tl-body">
              <div className="tl-cat">{t.cat}</div>
              <h4>{t.title}</h4>
              <p>{t.text}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ---------- Retail: Wm Low & Iceland ----------
function Retail() {
  return (
    <section className="section retail" id="retail">
      <SectionHead n="SHEET 06" title="Willie Low's &amp;" em="the freezer age"
        lede="If the bypass rewrote Perth's roads, the supermarkets rewrote its weekly shop. Two names sit at the centre of that 1980s and 90s story — a Dundee grocer with two stores in town, and the frozen-food chain that ate its leftovers." />

      <div className="prose">
        <p className="lead firstcap">William Low &amp; Co — "Willie Low's" to everyone — was founded in Dundee in 1868 and grew into Scotland's home-grown supermarket champion. By the 1980s it had <strong>two stores in Perth</strong>: one on Victoria Street in the city centre, and a larger one out on the <strong>Crieff Road</strong>, on the northern approach near the new bypass and the Inveralmond estate — exactly the kind of car-borne, edge-of-town site the new roads had created.</p>
      </div>

      {/* Wm Low fascia */}
      <div className="fascia" style={{ "--store-bg": "#6d2335" }}>
        <div className="fascia-band">
          <div className="fascia-sign">
            <span className="est">Established Dundee · 1868</span>
            <span className="word">Wm&nbsp;Low</span>
            <span className="tag">"Low prices, every day"</span>
          </div>
          <div className="fascia-meta">
            <h3>Scotland's own supermarket</h3>
            <p>A smaller player than its English rivals, Low's served the Tayside towns better than anyone, and at its peak commanded an eighth of the entire Scottish grocery market. Its market share climbed through the early eighties before the giants moved north.</p>
            <p>It even ran its own frozen-food chain, <strong>Lowfreeze</strong> — a thread that ties Low's directly to Iceland's arrival in Perth.</p>
            <dl>
              <dt>Perth stores</dt><dd>Victoria St · Crieff Rd</dd>
              <dt>Founded</dt><dd>1868</dd>
              <dt>Peak Scottish share</dt><dd>12.7% (1986)</dd>
              <dt>Ended</dt><dd>1994</dd>
            </dl>
          </div>
        </div>
      </div>

      {/* market share */}
      <div className="share">
        <h4>Wm Low share of the Scottish grocery market</h4>
        <div className="share-bars">
          {PD.SHARE.map((s) => (
            <div className="share-col" key={s.yr}>
              <span className="pct">{s.pct}%</span>
              <div className={`bar ${s.peak ? "peak" : ""}`} style={{ height: `${(s.pct / 13) * 100}%` }}></div>
              <span className="yr">{s.yr}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Iceland */}
      <div className="prose" style={{ marginTop: "44px" }}>
        <p className="dropline">The frozen-food chain</p>
        <p>Frozen food was the retail revolution of the decade — the chest freezer in the garage, the weekly stock-up, the microwave on the worktop. <strong>Iceland Frozen Foods</strong> rode it hard. In 1987 Low's sold its Lowfreeze stores to <strong>Bejam</strong>; in 1989 Iceland swallowed Bejam whole, and with it the Scottish freezer-centre business that had begun life under the Dundee grocer. By the end of the eighties Iceland was a fixture of Perth's High Street — bright, cold-aisled and cheap.</p>
      </div>

      <div className="fascia" style={{ "--store-bg": "#173f6e" }}>
        <div className="fascia-band">
          <div className="fascia-sign">
            <span className="est">Frozen Foods · the freezer age</span>
            <span className="word">Iceland</span>
            <span className="tag">"Mum's gone to Iceland"</span>
          </div>
          <div className="fascia-meta">
            <h3>From Lowfreeze to Iceland</h3>
            <p>A neat chain of ownership runs through Perth's freezer aisles: Low's built <strong>Lowfreeze</strong> → sold it to <strong>Bejam</strong> in 1987 → Bejam was bought by <strong>Iceland</strong> in 1989. The frozen-food business the city shopped in had Dundee roots all along.</p>
            <p>Where Low's chased the car and the edge-of-town site, Iceland held the centre — a High Street name through the 1990s as the big four reshaped everything around it.</p>
            <dl>
              <dt>In Perth from</dt><dd>Late 1980s</dd>
              <dt>Via</dt><dd>Bejam → Lowfreeze</dd>
              <dt>Format</dt><dd>High-street freezer centre</dd>
              <dt>Era</dt><dd>The 1980s–90s</dd>
            </dl>
          </div>
        </div>
      </div>

      {/* takeover battle */}
      <div className="battle">
        <h4>The end of Willie Low's — summer 1994</h4>
        <p className="sub">Tesco and Sainsbury's fought for the 57-store chain; whoever won would transform their weak Scottish presence overnight.</p>
        {PD.BATTLE.map((b, i) => (
          <div key={i} className={`battle-row ${b.win ? "win" : ""}`}>
            <div className="who">{b.who}<small>{b.role}</small></div>
            <div className="battle-bar-track"><div className="battle-bar" style={{ width: `${(b.val / 247) * 100}%` }}></div></div>
            <div className="battle-amt">{b.amt}</div>
          </div>
        ))}
      </div>

      <div className="pull">
        <blockquote>On 2 September 1994 Tesco took Willie Low's for £247 million — ending 126 years of business and doubling Tesco's Scottish market share at a stroke.</blockquote>
        <cite>Both Perth stores changed fascia · Crieff Road &amp; Victoria Street</cite>
      </div>

      <div className="prose">
        <p>For shoppers the change was a name over a door and a refit of the tills. But it marked the end of Scotland's last big independent grocer, and the moment Perth's food retailing passed wholly into the hands of the national chains. The Crieff Road site — born of the bypass, raised by a Dundee grocer — became a Tesco, and the city's weekly shop has revolved around the ring road ever since.</p>
      </div>
    </section>
  );
}

// ---------- Today + facts ----------
function Today() {
  return (
    <section className="section" id="today">
      <SectionHead n="SHEET 07" title="The Fair City," em="restored"
        lede="In 2012 Perth was made a city again — the old capital's title formally returned. The map is still moving: a third Tay crossing to the north, and whole new districts on the western edge." />
      <div className="prose">
        <p className="lead">The story did not stop with the bypass. A new settlement, Bertha Park, has risen to the north-west, and the Cross Tay Link Road — begun in 2022 — is adding the first wholly new crossing of the river in decades, looping traffic north of the town past Scone. Eight hundred years on, Perth is still doing what it has always done: rearranging itself around the river it was born on.</p>
      </div>
      <div className="facts">
        {PD.FACTS.map((f, i) => (
          <div className="fact" key={i}>
            <div className="fact-k">{f.k}</div>
            <div className="fact-v" dangerouslySetInnerHTML={{ __html: f.v }}></div>
          </div>
        ))}
      </div>
    </section>
  );
}

function Colophon() {
  return (
    <footer className="colophon">
      <div>
        <h3>About this survey</h3>
        <p>A diagrammatic deep-dive into the growth of Perth, Scotland — its medieval origins, its century as Scotland's greatest northern railway junction, the bypass that remade its edges after 1978, and the supermarket years that rewrote its weekly shop. The map is schematic: positions follow Perth's real geography but are stylised for clarity, not surveyed to scale.</p>
        <p style={{ fontFamily: "var(--mono)", fontSize: "11px", letterSpacing: "0.08em", color: "var(--ink-faint)" }}>Drawn for the almanac · {new Date().getFullYear()} · all dates checked against published histories</p>
      </div>
      <div className="src">
        <div style={{ color: "var(--ink-soft)", marginBottom: "8px", letterSpacing: "0.18em" }}>SOURCES</div>
        <a>History of Perth, Scotland — Wikipedia</a>
        <a>A9 road / A9 dualling — Scottish Roads Archive &amp; Transport Scotland</a>
        <a>William Low — Wikipedia &amp; The Courier</a>
        <a>Stirlingretail — "Space Wars: Tesco, Sainsbury &amp; Wm Low"</a>
        <a>Britannica · Perth</a>
      </div>
    </footer>
  );
}

Object.assign(window, { SectionHead, Origins, Industrial, Railways, Expansion, Timeline, Retail, Today, Colophon });
