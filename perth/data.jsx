// ============================================================
//  PERTH — DATA
//  Geometry for the animated survey map + all editorial content.
//  The map is a DIAGRAMMATIC survey (stylised), not a literal OS sheet:
//  positions are schematic but follow Perth's real geography —
//  the Tay running N→S then bending SE, the town on the west bank,
//  Scone across the river, the bypass arcing west to Inveralmond.
// ============================================================

window.PERTH = (function () {

  // ----- map canvas -----
  const VIEW = { w: 1000, h: 1300 };

  // ----- eras (drive the era caption under the year) -----
  const ERAS = [
    { from: -8000, name: "Before the burgh" },
    { from: 1124, name: "The medieval burgh" },
    { from: 1560, name: "Reformation & sieges" },
    { from: 1770, name: "The Georgian town" },
    { from: 1848, name: "The railway age" },
    { from: 1900, name: "Edwardian & wartime" },
    { from: 1945, name: "Postwar reconstruction" },
    { from: 1970, name: "Expansion & the bypass" },
    { from: 1995, name: "The retail city" },
    { from: 2012, name: "City of Perth, again" },
  ];
  function eraFor(year) {
    let e = ERAS[0];
    for (const cand of ERAS) if (year >= cand.from) e = cand;
    return e.name;
  }

  // ----- River Tay (centreline, north → south, bending SE) -----
  const TAY = "M 660 -10 L 650 90 L 655 180 L 666 280 L 675 372 L 672 452 L 658 522 L 638 586 L 614 642 L 600 696 L 606 756 L 632 822 L 678 886 L 738 946 L 808 1002 L 888 1058 L 978 1112 L 1010 1132";

  // ----- parkland: the two Inches (present throughout) -----
  const INCHES = [
    { id: "ninch", label: "NORTH INCH", from: 1124, points: "560,378 646,370 652,470 634,548 560,556 548,460" , lx: 596, ly: 468 },
    { id: "sinch", label: "SOUTH INCH", from: 1774, points: "540,690 626,684 636,762 560,776 528,730", lx: 582, ly: 732 },
  ];

  // ----- urban footprint, growing era by era -----
  const URBAN = [
    // medieval core
    { id: "core", era: "medieval", from: 1124, points: "548,560 622,556 628,642 544,650 538,600" },
    // georgian widening
    { id: "geo-n", era: "georgian", from: 1770, points: "520,500 628,494 632,560 522,566 510,532" },
    { id: "geo-s", era: "georgian", from: 1774, points: "522,648 636,642 648,716 540,728 516,688" },
    // victorian
    { id: "vic-w",  era: "victorian", from: 1850, points: "432,558 512,548 520,664 442,678 420,612" },
    { id: "vic-craigie", era: "victorian", from: 1860, points: "540,716 648,710 662,800 552,818 524,758" },
    { id: "vic-bridgend", era: "victorian", from: 1855, points: "664,556 742,552 754,648 672,658 656,604" },
    // edwardian
    { id: "edw-hilly", era: "edwardian", from: 1908, points: "432,440 506,450 514,548 432,558 412,500" },
    { id: "edw-cherry", era: "edwardian", from: 1912, points: "430,680 516,672 528,776 442,792 414,732" },
    // postwar
    { id: "pw-muirton", era: "postwar", from: 1948, points: "470,330 560,335 566,448 470,452 450,390" },
    { id: "pw-letham", era: "postwar", from: 1952, points: "338,468 432,458 442,602 354,616 324,540" },
    { id: "pw-tulloch", era: "postwar", from: 1958, points: "374,360 466,352 472,452 380,460 358,408" },
    // 1970s+
    { id: "s70-nmuirton", era: "seventies", from: 1974, points: "484,234 576,240 582,336 480,338 464,286" },
    { id: "s70-inveralmond", era: "seventies", from: 1972, points: "470,118 586,116 592,224 474,226 454,170" },
    { id: "s70-moncreiffe", era: "seventies", from: 1976, points: "618,772 702,780 712,876 624,886 604,826" },
    // modern
    { id: "mod-hunting", era: "modern", from: 1996, points: "252,498 332,490 342,612 264,622 242,560" },
    { id: "mod-bertha", era: "modern", from: 2018, points: "298,248 400,244 410,350 304,356 282,300" },
  ];

  // ----- neighbourhood labels -----
  const NEIGHBOURHOODS = [
    { name: "St John's Toun", x: 584, y: 606, from: 1124, big: true },
    { name: "Scone", x: 822, y: 332, from: 1124 },
    { name: "Bridgend", x: 702, y: 606, from: 1855 },
    { name: "Burghmuir", x: 460, y: 618, from: 1850 },
    { name: "Craigie", x: 588, y: 762, from: 1860 },
    { name: "Hillyland", x: 462, y: 500, from: 1908 },
    { name: "Cherrybank", x: 472, y: 736, from: 1912 },
    { name: "Muirton", x: 512, y: 396, from: 1948 },
    { name: "Letham", x: 386, y: 546, from: 1952 },
    { name: "Tulloch", x: 414, y: 406, from: 1958 },
    { name: "North Muirton", x: 528, y: 290, from: 1974 },
    { name: "Inveralmond", x: 528, y: 172, from: 1972 },
    { name: "Moncreiffe", x: 662, y: 828, from: 1976 },
    { name: "Huntingtower", x: 296, y: 560, from: 1996 },
    { name: "Bertha Park", x: 350, y: 300, from: 2018 },
  ];

  // ----- railways -----
  const RAIL = [
    { id: "central", name: "Scottish Central — to Stirling & the south", opened: 1848,
      d: "M 470 650 L 456 760 L 440 902 L 426 1050 L 416 1310" },
    { id: "highland", name: "Highland Railway — to Inverness", opened: 1856,
      d: "M 470 650 L 476 540 L 486 420 L 496 300 L 506 150 L 510 -10" },
    { id: "dundee", name: "Dundee & Perth — across the Tay", opened: 1847,
      d: "M 470 650 L 560 666 L 662 702 L 762 762 L 872 822 L 1010 884", bridge: [624, 688] },
    { id: "glenfarg", name: "Glenfarg line — to Edinburgh", opened: 1890, closed: 1970,
      d: "M 456 760 L 522 860 L 582 980 L 622 1120 L 642 1310" },
    { id: "crieff", name: "Crieff Junction branch", opened: 1856, closed: 1964,
      d: "M 470 650 L 380 642 L 268 636 L 138 640 L -10 650" },
    { id: "methven", name: "Methven & Bankfoot branches", opened: 1858, closed: 1965,
      d: "M 496 300 L 410 282 L 300 266 L 178 256 L -10 250" },
  ];

  // ----- roads / the bypass -----
  const ROADS = [
    { id: "m90", name: "M90 — from the Forth", opened: 1978, kind: "motorway",
      d: "M 330 1310 L 322 1150 L 316 1000 L 310 900 L 300 840" },
    { id: "bypass", name: "A9 western bypass", opened: 1979, kind: "motorway",
      d: "M 300 840 C 250 720 256 560 300 440 C 338 330 420 222 492 120 L 496 92" },
    { id: "friarton", name: "Friarton Bridge & SE leg", opened: 1978, kind: "motorway",
      d: "M 300 880 L 344 1000 L 472 1042 L 600 1010 L 690 928 L 812 910 L 956 932 L 1010 936", bridge: [690, 928] },
  ];

  // the old trunk route through the town (pre-bypass congestion), dimmed after 1978
  const OLD_A9 = "M 426 1050 L 470 900 L 520 760 L 560 640 L 540 500 L 506 320 L 500 150";

  // ----- landmark markers (type drives the glyph) -----
  const MARKERS = [
    { id: "kirk", name: "St John's Kirk", x: 585, y: 600, from: 1140, type: "civic" },
    { id: "perthbr", name: "Perth Bridge", x: 630, y: 560, from: 1771, type: "bridge" },
    { id: "station", name: "Perth General Station", x: 470, y: 650, from: 1848, type: "rail" },
    { id: "ga", name: "General Accident HQ", x: 614, y: 640, from: 1885, type: "civic" },
    { id: "pri", name: "Perth Royal Infirmary", x: 392, y: 582, from: 1914, type: "civic" },
    { id: "queensbr", name: "Queen's Bridge", x: 624, y: 628, from: 1960, type: "bridge" },
    { id: "wmlow-vic", name: "Wm Low, Victoria St", x: 560, y: 624, from: 1972, type: "retail" },
    { id: "friartonbr", name: "Friarton Bridge", x: 690, y: 926, from: 1978, type: "bridge" },
    { id: "broxden", name: "Broxden Junction", x: 300, y: 840, from: 1979, type: "junction" },
    { id: "inveralmond-r", name: "Inveralmond r'about", x: 496, y: 96, from: 1978, type: "junction" },
    { id: "wmlow-crieff", name: "Wm Low, Crieff Rd", x: 446, y: 452, from: 1980, type: "retail" },
    { id: "iceland", name: "Iceland, city centre", x: 600, y: 632, from: 1989, type: "retail" },
    { id: "stcath", name: "St Catherine's R.P.", x: 476, y: 566, from: 1990, type: "retail" },
  ];

  // ----- events that play in the scrubber panel (and pulse on the map) -----
  const MAP_EVENTS = [
    { year: 1124, title: "A royal burgh on the Tay", focus: { x: 585, y: 600 },
      text: "David I grants burgh status at the lowest bridgeable point of the Tay. The walled toun sits in a tight grid between river and rampart." },
    { year: 1210, title: "Flood and refounding", focus: { x: 600, y: 640 },
      text: "A catastrophic Tay flood sweeps away the royal castle; William the Lion refounds the burgh, fixing the street plan still legible today." },
    { year: 1559, title: "The Reformation begins", focus: { x: 585, y: 600 },
      text: "John Knox preaches in St John's Kirk; the friaries beyond the wall are sacked. Their names survive in the streets — Blackfriars, Greyfriars." },
    { year: 1771, title: "Smeaton's stone bridge", focus: { x: 630, y: 560 },
      text: "A permanent bridge finally tames the crossing, knitting the burgh to Bridgend and opening the road north." },
    { year: 1774, title: "The Inches laid out", focus: { x: 582, y: 732 },
      text: "North and South Inch are formalised as public parks — a green frame the city has kept ever since." },
    { year: 1848, title: "The railways arrive", focus: { x: 470, y: 650 },
      text: "A joint General Station opens on the western edge. Within fifteen years Perth is the meeting point of five companies." },
    { year: 1863, title: "Gateway to the Highlands", focus: { x: 496, y: 300 },
      text: "The Highland Railway pushes north over Druimuachdar. Perth becomes the funnel for every train to Inverness." },
    { year: 1885, title: "General Accident founded", focus: { x: 614, y: 640 },
      text: "An insurance house begins on Tay Street; it will grow into one of Britain's largest and anchor white-collar Perth for a century." },
    { year: 1948, title: "Muirton & council housing", focus: { x: 512, y: 396 },
      text: "Postwar estates march onto the fields north and west — Muirton, then Letham and Tulloch — doubling the built-up area." },
    { year: 1960, title: "Queen's Bridge", focus: { x: 624, y: 628 },
      text: "A second city-centre crossing opens, easing the medieval pinch point as car ownership climbs." },
    { year: 1964, title: "Beeching closes the branches", focus: { x: 268, y: 636 },
      text: "The Crieff, Methven and Bankfoot branches are lifted. Perth keeps its trunk routes but loses its rural web." },
    { year: 1970, title: "Glenfarg line severed", focus: { x: 582, y: 980 },
      text: "The direct Edinburgh line via Glenfarg closes so the M90 can be driven through the gap — road replacing rail." },
    { year: 1972, title: "Inveralmond takes shape", focus: { x: 528, y: 172 },
      text: "A new industrial estate opens on the northern approach, seeded by the coming bypass and cheap greenfield land." },
    { year: 1978, title: "Friarton Bridge", focus: { x: 690, y: 926 },
      text: "A high-level bridge carries the new road over the Tay south of the town — the keystone of the bypass." },
    { year: 1979, title: "The bypass opens", focus: { x: 300, y: 600 },
      text: "Through traffic swings west around the town via Broxden. The choked High Street exhales; the edges begin to boom." },
    { year: 1980, title: "Wm Low on the Crieff Road", focus: { x: 446, y: 452 },
      text: "Edge-of-town grocery arrives: a big Wm Low near the new road, with a car park to match the car age." },
    { year: 1989, title: "Iceland & the freezer age", focus: { x: 600, y: 632 },
      text: "Frozen-food retailing lands in the centre as Iceland absorbs Bejam — itself the buyer of Low's old 'Lowfreeze' chain." },
    { year: 1994, title: "Tesco takes Wm Low", focus: { x: 446, y: 452 },
      text: "After a £247m battle with Sainsbury's, Tesco buys the Dundee chain. Both Perth stores change fascia; 126 years end." },
    { year: 2012, title: "City status restored", focus: { x: 584, y: 606 },
      text: "Perth is made a city again in the Diamond Jubilee honours — the old capital's title formally returned." },
    { year: 2022, title: "Bertha Park & the new edge", focus: { x: 350, y: 300 },
      text: "A whole new settlement rises to the north-west; the Cross Tay Link Road is begun to relieve the river crossings." },
  ];

  // ----- the timeline section -----
  const TIMELINE = [
    { year: "c.1124", cat: "civic", title: "Burgh of David I", text: "Perth is established as a royal burgh at the first place the Tay could be bridged — and the last place ships could reach upriver." },
    { year: "1210", cat: "civic", title: "Refounded after the flood", text: "A devastating flood destroys the royal castle; the burgh is refounded and its medieval grid of gaits and vennels is fixed." },
    { year: "1396", cat: "civic", title: "Battle of the Clans", text: "Thirty against thirty, Clan Chattan and Clan Kay fight a judicial combat on the North Inch before the king." },
    { year: "1437", cat: "civic", title: "A king murdered", text: "James I is assassinated at the Blackfriars; the court's drift to Edinburgh quietly ends Perth's run as effective capital." },
    { year: "1559", cat: "civic", title: "The Reformation", text: "John Knox's sermon in St John's Kirk sets off the stripping of the altars and the sacking of Perth's four friaries." },
    { year: "1771", cat: "growth", title: "Smeaton's Bridge", text: "John Smeaton's stone bridge finally survives the Tay's floods, ending centuries of ferries and washed-away crossings." },
    { year: "1774", cat: "civic", title: "The Inches as parks", text: "North and South Inch are laid out as public ground — green lungs the growing town never built over." },
    { year: "1847", cat: "railway", title: "Dundee & Perth Railway", text: "The first line reaches the town from the east, crossing the Tay and tying Perth to the coast and Dundee's docks." },
    { year: "1848", cat: "railway", title: "The General Station opens", text: "Scottish Central and Scottish Midland Junction trains run into a shared station on the western edge of the burgh." },
    { year: "1856–63", cat: "railway", title: "The road to Inverness", text: "Lines push north through Dunkeld and over Druimuachdar; the Highland Railway makes Perth the gate to the north." },
    { year: "1885", cat: "civic", title: "General Accident", text: "Founded on Tay Street, the insurer becomes a national giant and Perth's defining white-collar employer for a century." },
    { year: "1901", cat: "growth", title: "Electricity & trams", text: "Mains electricity arrives; from 1905 electric trams run the streets until buses replace them in 1929." },
    { year: "1948–60", cat: "growth", title: "The council estates", text: "Muirton, Letham, Tulloch and Hillyland spread the town onto its surrounding farmland in waves of postwar housing." },
    { year: "1960", cat: "growth", title: "Queen's Bridge", text: "A second central crossing of the Tay opens to relieve the 18th-century bridge as motor traffic climbs." },
    { year: "1962–65", cat: "railway", title: "Beeching's axe", text: "The Crieff, Methven, Bankfoot and Alyth branches close; Perth keeps its main lines but loses its rural network." },
    { year: "1970", cat: "railway", title: "Glenfarg line lifted", text: "The direct Perth–Edinburgh line is closed and its alignment partly used to build the M90 motorway through Glenfarg." },
    { year: "1972", cat: "growth", title: "Inveralmond estate", text: "A large industrial estate is developed on the northern edge, anticipating the bypass and serving new manufacturers." },
    { year: "1978", cat: "road", title: "Friarton Bridge", text: "A high-level bridge carries the new road over the Tay south of the town, completing the river side of the bypass." },
    { year: "1979–81", cat: "road", title: "The Perth bypass", text: "The A9/M90 western bypass opens via Broxden, removing through traffic from the centre and unlocking the edges." },
    { year: "1980s", cat: "retail", title: "Edge-of-town shopping", text: "Supermarkets and retail sheds follow the new roads to Crieff Road and the ring — the High Street's slow rival." },
    { year: "1986", cat: "road", title: "A9 reconstruction complete", text: "Scotland's largest 20th-century road scheme, the rebuilt Perth–Inverness A9, is finished after fourteen years." },
    { year: "1994", cat: "retail", title: "Tesco buys Wm Low", text: "After a takeover battle with Sainsbury's, Tesco acquires the Dundee chain; both Perth stores are rebranded." },
    { year: "2012", cat: "civic", title: "City status restored", text: "Perth regains the title of city in the Diamond Jubilee, a nod to its medieval role as a capital of Scots." },
    { year: "2022", cat: "road", title: "Cross Tay Link Road", text: "A third Tay crossing is begun to the north at Scone, the biggest change to Perth's road map since the bypass." },
  ];

  const TL_CATS = [
    { id: "all", label: "All" },
    { id: "civic", label: "Burgh & city" },
    { id: "railway", label: "Railways" },
    { id: "growth", label: "Growth" },
    { id: "road", label: "Roads" },
    { id: "retail", label: "Retail" },
  ];

  // ----- railway lines for the lines table -----
  const RAIL_LINES = [
    { id: "central", name: "Scottish Central Railway", sub: "Perth ↔ Stirling ↔ south", years: "1848 — open", status: "open",
      color: "oklch(26% 0.012 70)", note: "The spine south to Stirling, Glasgow and the Caledonian main line. Still the route of every southbound ScotRail and sleeper service." },
    { id: "dundee", name: "Dundee & Perth Railway", sub: "Perth ↔ Dundee, over the Tay", years: "1847 — open", status: "open",
      color: "oklch(26% 0.012 70)", note: "The first line into Perth, crossing the river to the east. Now the Tay-side route to Dundee, Aberdeen and the coast." },
    { id: "highland", name: "Highland Railway", sub: "Perth ↔ Inverness", years: "1863 — open", status: "open",
      color: "oklch(26% 0.012 70)", note: "Over Druimuachdar (1,484 ft, the highest main line in Britain). Today the Highland Main Line and the Caledonian Sleeper to the north." },
    { id: "glenfarg", name: "Glenfarg Line", sub: "Perth ↔ Edinburgh, direct", years: "1890 – 1970", status: "shut",
      color: "oklch(58% 0.075 56)", note: "The fast, direct route to the capital — closed so the M90 could be carved through Glenfarg. Trains to Edinburgh now detour via Ladybank." },
    { id: "crieff", name: "Crieff Junction Branch", sub: "Perth ↔ Crieff ↔ Comrie", years: "1856 – 1964", status: "shut",
      color: "oklch(58% 0.075 56)", note: "A rural branch west into Strathearn, swept away by the Beeching Report along with most of Perthshire's local lines." },
    { id: "methven", name: "Methven & Bankfoot", sub: "Northern rural branches", years: "1858 – 1965", status: "shut",
      color: "oklch(58% 0.075 56)", note: "Short agricultural branches off the Highland line. Passenger trains went early; goods lingered before the axe fell." },
  ];

  // ----- Wm Low market share (Scotland) -----
  const SHARE = [
    { yr: "1981", pct: 7.4 },
    { yr: "1984", pct: 10.4 },
    { yr: "1986", pct: 12.7, peak: true },
    { yr: "1990", pct: 9.8 },
    { yr: "1993", pct: 7.6 },
    { yr: "1994", pct: 6.6 },
  ];

  // ----- the 1994 takeover battle -----
  const BATTLE = [
    { who: "Tesco", role: "Opening bid · 14 Jul", amt: "£154m", val: 154 },
    { who: "Sainsbury's", role: "Counter-bid · 28 Jul", amt: "£210m", val: 210 },
    { who: "Tesco", role: "Winning bid · Aug", amt: "£247m", val: 247, win: true },
  ];

  // ----- headline facts -----
  const FACTS = [
    { k: "c.1124", v: "Year Perth was made a <strong>royal burgh</strong> by David I" },
    { k: "1452", v: "Last year Perth served as an effective <strong>capital of Scots</strong>" },
    { k: "5", v: "Railway companies that met at Perth in its <strong>junction heyday</strong>" },
    { k: "1,484 ft", v: "Druimuachdar — <strong>highest main line</strong> summit in Britain, north of Perth" },
    { k: "£200m+", v: "Cost of rebuilding the <strong>A9 to Inverness</strong>, 1972–86" },
    { k: "1978", v: "Friarton Bridge & the start of the <strong>Perth bypass</strong>" },
    { k: "126 yrs", v: "Length of <strong>Wm Low</strong>'s run before Tesco, 1868–1994" },
    { k: "2012", v: "Perth made a <strong>city</strong> again in the Diamond Jubilee" },
  ];

  return {
    VIEW, ERAS, eraFor, TAY, INCHES, URBAN, NEIGHBOURHOODS,
    RAIL, ROADS, OLD_A9, MARKERS, MAP_EVENTS, TIMELINE, TL_CATS,
    RAIL_LINES, SHARE, BATTLE, FACTS,
  };
})();
