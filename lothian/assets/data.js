/* ============================================================
   LOTHIAN — data.js  ·  single source of truth
   Figures researched from Lothian Buses, council reports and
   trade press (2023–25). Where a value is an estimate or
   interpolation it is flagged with est:true on the datapoint.
   ============================================================ */
window.LB = (function(){

/* ---------- headline stats ---------- */
const STATS = {
  founded: 1919,
  fleet: 730,
  routes: 70,
  staff: 2500,
  drivers: 1700,
  passengers2023: 110,        // millions
  revenue2023: 176.6,         // £m
  depots: 5,
  cityShare: 91,              // % owned by City of Edinburgh Council
};

/* ---------- service sub-brands ---------- */
const BRANDS = [
  { key:'city', name:'Lothian City', accent:'var(--madder)', years:'1919 — present',
    note:'The core red-and-gold city network — 50-plus day routes blanketing Edinburgh and its suburbs, the densest urban bus operation in Scotland.',
    stat:['~50','day routes'] },
  { key:'airlink', name:'Airlink 100', accent:'var(--sky)', years:'blue · airport express',
    note:'Airlink 100 links Waverley Bridge to Edinburgh Airport in around 30 minutes. The separate Skylink airport routes were withdrawn in April 2025 and folded back into city services (renumbered 17 and 18).',
    stat:['100','flagship airport express'] },
  { key:'country', name:'Lothian Country', accent:'var(--green)', years:'green livery',
    note:'Longer inter-urban routes reaching out to West Lothian — Livingston, Bathgate, Linlithgow — under a distinct green-and-white identity.',
    stat:['X','-prefixed expresses'] },
  { key:'eastcoast', name:'East Coast Buses', accent:'#1f6f9e', years:'est. 2016',
    note:'Took over East Lothian routes from First in August 2016 — Musselburgh, Tranent, Haddington, Dunbar and North Berwick along the coast.',
    stat:['2016','founded'] },
  { key:'tours', name:'Edinburgh Bus Tours', accent:'var(--gold-deep)', years:'open-top',
    note:'The open-top sightseeing fleet — City Sightseeing, Majestic, Edinburgh Tour and the vintage Mac Tours — circling the Old and New Towns.',
    stat:['4','tour brands'] },
  { key:'trams', name:'Edinburgh Trams', accent:'#6a4a8c', years:'sister · 2014',
    note:'Not buses, but family: since 2013 buses and trams sit together under Transport for Edinburgh, sharing the Ridacard and the Tap Tap Cap.',
    stat:['2014','line opened'] },
];

/* ---------- history timeline ---------- */
const TIMELINE = [
  { y:1871, t:'Horse trams begin', d:'The Edinburgh Street Tramways Company lays the first horse-drawn tram rails — the ancestor of the modern network.' },
  { y:1919, t:'The Corporation takes over', d:'Edinburgh Corporation Tramways Department assumes control of the city’s transport — the birth year Lothian still counts from. Motor buses join the fleet the same era.' },
  { y:1922, t:'Cable cars to electric', d:'Edinburgh’s unusual cable-hauled tram system is converted to overhead electric traction, modernising the core network.' },
  { y:1928, t:'Buses go city-wide', d:'Motor buses spread across routes the trams could not reach, establishing the rubber-tyred network that would eventually replace the rails.' },
  { y:1956, t:'Last tram runs', d:'On 16 November the final Edinburgh tram runs to Shrubhill. Buses now carry the whole city; the department becomes Edinburgh Corporation Transport.' },
  { y:1964, t:'Rear-engine revolution', d:'The first rear-engined Leyland Atlantean double-deckers arrive — open-platform crewmen give way to one-person operation.' },
  { y:1975, t:'Lothian Region Transport', d:'Local-government reorganisation creates Lothian Regional Council; the operator is renamed Lothian Region Transport (LRT).' },
  { y:1986, t:'Deregulation & arm’s length', d:'The Transport Act deregulates Britain’s buses. LRT becomes an arm’s-length company owned by the councils — a model it keeps to this day.' },
  { y:2000, t:'“Lothian Buses” is born', d:'The company rebrands simply as Lothian Buses plc, dropping “Region Transport”, and begins the long shift to a modern low-floor fleet.' },
  { y:2006, t:'The flat fare', d:'Lothian adopts a single flat adult fare across the whole city network — no zones, no distance pricing. A defining feature ever since.' },
  { y:2009, t:'Harlequin & the Ridacard', d:'A bold “harlequin” transitional livery and the smart Ridacard season ticket modernise the brand on the road and in the wallet.' },
  { y:2011, t:'First hybrids', d:'Fifteen Alexander Dennis Enviro400H hybrids enter service on route 10 — the first step away from pure diesel.' },
  { y:2013, t:'Transport for Edinburgh', d:'A new holding company, Transport for Edinburgh, is created to bring buses and the forthcoming trams under one roof.' },
  { y:2014, t:'Trams return', d:'Edinburgh Trams open between the Airport and York Place — rails back on the city’s streets 58 years after the last tram.' },
  { y:2016, t:'East Coast Buses & a new look', d:'Lothian launches East Coast Buses in East Lothian and unveils its sharp modern “fleet of the future” livery on a Wright StreetDeck.' },
  { y:2020, t:'Euro6, then a pandemic', d:'The entire fleet reaches the clean Euro6 standard — just as COVID-19 collapses ridership to a fraction of normal overnight.' },
  { y:2023, t:'Recovery & the electric order', d:'Passenger numbers rebound 17% to 110 million; the company orders 50 Volvo BZL Electric double-deckers and publishes its net-zero plan.' },
  { y:2024, t:'First electrics on the road', d:'The first fully electric double-deckers enter service on routes 8 and 9, and Lothian returns its first council dividend since 2019.' },
  { y:2035, t:'Target: net zero', d:'Lothian’s “Driving towards Net Zero” strategy targets a zero-tailpipe-emission fleet — depot by depot, batch by batch.' },
];

/* ---------- fleet (representative vehicle classes) ---------- */
// type: dd=double-deck, sd=single-deck, ot=open-top  | fuel: diesel/hybrid/electric
const FLEET = [
  { id:'atlantean', name:'Leyland Atlantean', maker:'Leyland', body:'Alexander', yr:1965, era:'Heritage', type:'dd', fuel:'diesel', len:9.6, cap:78, status:'preserved',
    note:'Edinburgh’s first rear-engined double-decker. ESF 801C survives in preservation, the genesis of one-person operation.' },
  { id:'fleetline', name:'Daimler/Leyland Fleetline', maker:'Leyland', body:'Alexander', yr:1973, era:'Heritage', type:'dd', fuel:'diesel', len:9.5, cap:75, status:'retired',
    note:'A workhorse of the LRT era in traditional madder and white, with the classic Alexander body.' },
  { id:'olympian', name:'Leyland/Volvo Olympian', maker:'Volvo', body:'Alexander', yr:1990, era:'Heritage', type:'dd', fuel:'diesel', len:10.3, cap:81, status:'retired',
    note:'The mainstay double-decker of the 1990s; some served the open-top tour fleet for years afterwards.' },
  { id:'president', name:'Dennis Trident / President', maker:'Dennis', body:'Plaxton', yr:1999, era:'Low-floor', type:'dd', fuel:'diesel', len:10.5, cap:79, status:'retired',
    note:'Among the first low-floor, step-free double-deckers — a turning point for accessibility.' },
  { id:'b7tl', name:'Volvo B7TL', maker:'Volvo', body:'Wright Eclipse Gemini', yr:2002, era:'Low-floor', type:'dd', fuel:'diesel', len:10.4, cap:78, status:'retired',
    note:'Started Lothian’s long marriage with Volvo chassis and Wrightbus Gemini bodies.' },
  { id:'b9tl', name:'Volvo B9TL', maker:'Volvo', body:'Wright Eclipse Gemini 2', yr:2008, era:'Modern', type:'dd', fuel:'diesel', len:10.4, cap:79, status:'active',
    note:'A backbone of the fleet for over a decade; hundreds bought in successive batches.' },
  { id:'e400h', name:'ADL Enviro400H', maker:'Alexander Dennis', body:'Enviro400', yr:2011, era:'Modern', type:'dd', fuel:'hybrid', len:10.4, cap:78, status:'active',
    note:'Fifteen hybrids on route 10 — Lothian’s first move beyond pure diesel.' },
  { id:'v7900h', name:'Volvo 7900 Hybrid', maker:'Volvo', body:'Volvo 7900', yr:2013, era:'Modern', type:'sd', fuel:'hybrid', len:12.0, cap:40, status:'active',
    note:'Single-deck hybrids that cut emissions on the busy city-centre route 1.' },
  { id:'b5tl', name:'Volvo B5TL', maker:'Volvo', body:'Wright Eclipse Gemini 3', yr:2015, era:'Modern', type:'dd', fuel:'diesel', len:10.4, cap:81, status:'active',
    note:'The dominant double-decker class of the late 2010s, many in the angular new livery.' },
  { id:'streetair', name:'Wright StreetAir EV', maker:'Wrightbus', body:'StreetAir', yr:2017, era:'Modern', type:'sd', fuel:'electric', len:9.5, cap:38, status:'active',
    note:'Six battery-electric single-deckers — Lothian’s first zero-tailpipe buses, on route 1.' },
  { id:'b5lh', name:'Volvo B5LH', maker:'Volvo', body:'Wright Gemini 3 / Enviro400', yr:2018, era:'Modern', type:'dd', fuel:'hybrid', len:10.5, cap:80, status:'active',
    note:'Diesel-electric hybrid double-deckers rolled out across busy trunk corridors.' },
  { id:'e400xlb', name:'ADL Enviro400 XLB', maker:'Alexander Dennis', body:'Enviro400 XLB', yr:2019, era:'Modern', type:'dd', fuel:'diesel', len:11.5, cap:100, status:'active',
    note:'Extra-long “XLB” deckers carrying up to 100 — among the highest-capacity buses in the UK.' },
  { id:'ecb-sd', name:'Volvo B8RLE (East Coast)', maker:'Volvo', body:'MCV eVoSeti / Wright', yr:2018, era:'Modern', type:'sd', fuel:'diesel', len:12.0, cap:44, status:'active',
    note:'Coast-running single-deckers in East Coast Buses’ blue, reaching Dunbar and North Berwick.' },
  { id:'tour-ot', name:'Open-top tour decker', maker:'Volvo / Dennis', body:'converted', yr:2010, era:'Modern', type:'ot', fuel:'diesel', len:10.3, cap:70, status:'active',
    note:'Roofless double-deckers for City Sightseeing, Majestic and Mac Tours around the Old Town.' },
  { id:'bzl', name:'Volvo BZL Electric', maker:'Volvo', body:'MCV', yr:2024, era:'Electric', type:'dd', fuel:'electric', len:10.9, cap:70, status:'active',
    note:'Fifty pure-electric double-deckers — 470 kWh of batteries, ~300 km range — on routes 8 and 9.' },
];

/* ---------- routes drawn on the interactive schematic map ----------
   A traceable subset (one line per service); the FULL roster is in ROSTER.
   8 & 9 are the routes that received the Volvo BZL electric double-deckers. */
const ROUTES = [
  { n:'1',   col:'#d6336c', kind:'city',      name:'Clermiston — Seafield',            via:'Corstorphine · Murrayfield · Haymarket · Princes St · Easter Road' },
  { n:'3',   col:'#e8590c', kind:'city',      name:'Clovenstone — Mayfield',           via:'Wester Hailes · Gorgie · Haymarket · Newington · Gilmerton' },
  { n:'5',   col:'#c2255c', kind:'city',      name:"Hunter's Tryst — The Jewel",       via:'Oxgangs · Morningside · Newington · North Bridge · Portobello' },
  { n:'7',   col:'#1098ad', kind:'city',      name:'Newhaven — Royal Infirmary',       via:'Goldenacre · city centre · Newington · Little France' },
  { n:'8',   col:'#2e8158', kind:'electric',  name:'Muirhouse — Royal Infirmary',      via:'Goldenacre · The Bridges · Newington · Little France' },
  { n:'9',   col:'#1f9d6b', kind:'electric',  name:"Muirhouse — King's Buildings",     via:'Pilton · Goldenacre · city centre · Mayfield Road' },
  { n:'10',  col:'#7048a8', kind:'city',      name:'Ocean Terminal — Bonaly',          via:'Leith Walk · Princes St · Craiglockhart · Colinton' },
  { n:'11',  col:'#0c8599', kind:'city',      name:'Western Harbour — Hyvots Bank',    via:'Newhaven · Princes St · Morningside · Comiston' },
  { n:'12',  col:'#66a80f', kind:'city',      name:'Gyle — Portobello',                via:'Drum Brae · Haymarket · Tollcross · Cameron Toll · Portobello' },
  { n:'14',  col:'#9c36b5', kind:'city',      name:'Muirhouse — Greendykes',           via:'Goldenacre · The Bridges · Newington · Niddrie' },
  { n:'16',  col:'#1971c2', kind:'city',      name:'Silverknowes — Torphin',           via:'Crewe Toll · Princes St · Morningside · Oxgangs · Colinton' },
  { n:'22',  col:'#e8730c', kind:'city',      name:'Granton Harbour — Gyle',           via:'Crewe Toll · Craigleith · Princes St · Gorgie · Edinburgh Park' },
  { n:'25',  col:'#0ca678', kind:'city',      name:'Heriot-Watt Uni — Restalrig',      via:'Sighthill · Gorgie · Haymarket · Princes St · Leith Walk' },
  { n:'26',  col:'#c92a2a', kind:'city',      name:'Clerwood — Tranent',               via:'Drum Brae · Corstorphine · Princes St · Portobello · Musselburgh' },
  { n:'27',  col:'#5f3dc4', kind:'city',      name:"Silverknowes — Hunter's Tryst",    via:'Crewe Toll · Goldenacre · Tollcross · Craiglockhart · Oxgangs' },
  { n:'30',  col:'#594100', kind:'city',      name:'Clovenstone — Queen Margaret Uni', via:'Slateford · Princes St · Newington · Cameron Toll · Craigmillar' },
  { n:'31',  col:'#4263eb', kind:'city',      name:'East Craigs — Bonnyrigg',          via:'Corstorphine · Haymarket · Newington · Cameron Toll · Gilmerton' },
  { n:'32',  col:'#f76707', kind:'city',      name:'Cramond — Balerno',                via:"Davidson's Mains · Drum Brae · The Gyle · Wester Hailes · Juniper Green" },
  { n:'34',  col:'#f08c00', kind:'city',      name:'Heriot-Watt Uni — Ocean Terminal', via:'Wester Hailes · Slateford · Fountainbridge · Leith Walk · Restalrig' },
  { n:'35',  col:'#ae3ec9', kind:'city',      name:'Heriot-Watt Uni — Ocean Terminal', via:'Juniper Green · Colinton · Slateford · Old Town · Leith' },
  { n:'45',  col:'#b8860b', kind:'city',      name:"Heriot-Watt Uni — King's Road",    via:"Currie · Juniper Green · Colinton · Craiglockhart · King's Road" },
  { n:'44',  col:'#087f5b', kind:'city',      name:'Balerno — Wallyford',              via:'Juniper Green · Colinton · Slateford · Haymarket · Musselburgh' },
  { n:'100', col:'#1864ab', kind:'airlink',   name:'Airlink — Edinburgh Airport',      via:'Waverley Bridge · Haymarket · Airport' },
  { n:'ECB', col:'#1f6f9e', kind:'eastcoast', name:'East Coast Buses — North Berwick', via:'Musselburgh · Haddington · the coast' },
  { n:'LC',  col:'#2f9e44', kind:'country',   name:'Lothian Country — Livingston',     via:'Gyle · Edinburgh Park · West Lothian' },
  { n:'N',   col:'#3b3054', kind:'night',     name:'Night Network',                    via:'After-midnight city services' },
  { n:'T',   col:'#b5830a', kind:'tour',      name:'City Sightseeing — Old Town loop', via:'Open-top · Royal Mile · Grassmarket' },
];

/* ---------- the FULL network roster (every service) ----------
   City termini per Lothian's official timetable, 2025. */
const ROSTER = [
  { group:'City day services', note:'The numbered madder-and-gold network in the A/B “city” fare zone — around 40 day routes. 8 & 9 now run electric double-deckers.', items:[
    ['1','Clermiston — Seafield'],['2','Gyle Centre — The Jewel'],['3','Clovenstone — Mayfield'],
    ['4','Hillend — Queen Margaret University'],['5',"Hunter's Tryst — The Jewel"],['7','Newhaven — Royal Infirmary'],
    ['8','Muirhouse — Royal Infirmary',true],['9',"Muirhouse — King's Buildings",true],['10','Bonaly — Ocean Terminal'],
    ['11','Western Harbour — Hyvots Bank'],['12',"Gyle Centre — King's Road"],['13','Westburn — Stockbridge'],
    ['14','Muirhouse — Greendykes'],['15','Easter Bush — Newhaven'],['16','Silverknowes — Torphin'],
    ['17','Ocean Terminal — Edinburgh Airport'],['18','Gyle Centre — Fort Kinnaird'],['19','Granton — Restalrig'],
    ['21','The Gyle — Royal Infirmary'],['22','Gyle Centre — Ocean Terminal'],['23','Trinity — Greenbank'],
    ['24','West Granton — Royal Infirmary'],['25','Heriot-Watt University — Restalrig'],['26','Clerwood — Tranent'],
    ['27',"Silverknowes — Hunter's Tryst"],['29','Silverknowes — Gorebridge'],['30','Clovenstone — Musselburgh'],
    ['31','East Craigs — Bonnyrigg / Rosewell'],['32','Cramond — Balerno'],['33','Westburn — Millerhill'],
    ['34','Heriot-Watt University — Ocean Terminal'],['35','Heriot-Watt University — Ocean Terminal'],['36','Gyle Centre — Ocean Terminal'],
    ['37','Silverknowes — Penicuik'],['38','West Granton — Royal Infirmary'],['39','Dalkeith — Mayfield'],
    ['44','Balerno — Wallyford'],['45',"King's Road — Heriot-Watt University"],['47','Cammo — Ladywood'],
    ['48','Edinburgh Park — Gorebridge'],
  ]},
  { group:'Airlink & airport', note:'The premium blue airport express (airport fares apply); city routes 17 & 48 and the tram also reach the airport.', items:[
    ['100','Airlink — Waverley Bridge ⇄ Edinburgh Airport'],
  ]},
  { group:'Lothian Country', note:'Green-liveried services to West Lothian in country fare zones C–H, including limited-stop X-expresses.', items:[
    ['43','Queensferry — Dalmeny — Blackhall — Edinburgh'],['70','Gyle Centre — Ratho — Hermiston Park & Ride'],
    ['71','Queensferry — Kirkliston — Newbridge — Gyle Centre'],['72','Fauldhouse — Livingston — Broxburn — Winchburgh'],
    ['73','Armadale — Bathgate — Deans — Livingston'],['74','Fauldhouse — West Calder — Livingston — Bathgate'],
    ['X18','Whitburn — Armadale — Bathgate — Broxburn — Edinburgh'],['X19','Winchburgh — Kirkliston — Corstorphine — Edinburgh'],
    ['X27','Bathgate — Livingston — East Calder — Edinburgh'],['X28','Bathgate — Livingston — Kirknewton — Edinburgh'],
    ['X40',"St John's Hospital — East Calder — Edinburgh"],
  ]},
  { group:'East Coast Buses', note:'Blue-liveried subsidiary (est. 2016) running East Lothian and the coast in zones C–H.', items:[
    ['X4','Tranent — Prestonpans — Wallyford — Edinburgh'],['X5','North Berwick — Gullane — Longniddry — Edinburgh'],
    ['X6','Haddington — Macmerry — Tranent — Edinburgh'],['X7','Dunbar — East Linton — Haddington — Edinburgh'],
    ['106','Haddington — Musselburgh — Fort Kinnaird — Edinburgh'],['113','Pencaitland — Tranent — Musselburgh — Edinburgh'],
    ['120','North Berwick — Gullane — Dunbar'],['121','North Berwick — Drem — Haddington'],
    ['123','Haddington — Gifford — Pencaitland (circular)'],['124','North Berwick — Longniddry — Musselburgh — Edinburgh'],
    ['140','Musselburgh — Dalkeith — Bonnyrigg — Penicuik'],['141','Musselburgh — Dalkeith — Loanhead — Easter Bush'],
  ]},
  { group:'Night Network', note:'After-midnight services prefixed N — the city night buses plus the country and coastal night routes shown on the official map.', items:[
    ['N18','Bathgate — Broxburn — Edinburgh (night)'],['N28','Livingston — East Calder — Edinburgh (night)'],
    ['N43','Queensferry — Edinburgh (night)'],['N107','Musselburgh — Edinburgh (night)'],
    ['N113','Tranent — Musselburgh — Edinburgh (night)'],['N124','North Berwick — Musselburgh — Edinburgh (night)'],
  ]},
  { group:'Edinburgh Bus Tours', note:'The open-top sightseeing fleet around the Old & New Towns.', items:[
    ['CS','City Sightseeing — red'],['ET','Edinburgh Tour — green'],['MJ','Majestic Tour'],['3B','3 Bridges Tour'],
  ]},
];

/* ---------- ridership (millions of passenger journeys) ---------- */
const RIDERSHIP = [
  { y:2015, v:115 }, { y:2016, v:118 }, { y:2017, v:121 }, { y:2018, v:124 },
  { y:2019, v:123 }, { y:2020, v:48, note:'COVID-19 collapse' },
  { y:2021, v:58 }, { y:2022, v:94 }, { y:2023, v:110 },
  { y:2024, v:118, est:true },
];

/* ---------- finance (£m) ---------- */
const REVENUE = [
  { y:2017, v:140, est:true }, { y:2018, v:146, est:true }, { y:2019, v:152, est:true },
  { y:2020, v:96, est:true }, { y:2021, v:108, est:true }, { y:2022, v:150, est:true },
  { y:2023, v:176.6 }, { y:2024, v:186, est:true },
];
const DIVIDEND = [
  { y:2017, v:5.5 }, { y:2018, v:6.6 }, { y:2019, v:6.0, est:true },
  { y:2020, v:0 }, { y:2021, v:0 }, { y:2022, v:0 }, { y:2023, v:0 },
  { y:2024, v:3.2 }, { y:2025, v:0, note:'Reinvested in electrification' },
];
const OWNERS = [
  { name:'City of Edinburgh Council', pct:91, col:'var(--madder)' },
  { name:'Midlothian Council', pct:5, col:'var(--gold)' },
  { name:'East Lothian Council', pct:3, col:'var(--green)' },
  { name:'West Lothian Council', pct:1, col:'var(--sky)' },
];

/* ---------- electric / fuel transition (share of fleet, %) ---------- */
const FUELMIX = [
  { y:2010, diesel:100, hybrid:0,  electric:0 },
  { y:2013, diesel:96,  hybrid:4,  electric:0 },
  { y:2017, diesel:88,  hybrid:11, electric:1 },
  { y:2020, diesel:84,  hybrid:15, electric:1 },
  { y:2024, diesel:78,  hybrid:14, electric:8 },
  { y:2030, diesel:35,  hybrid:15, electric:50, est:true },
  { y:2035, diesel:0,   hybrid:0,  electric:100, est:true },
];
const BZL = {
  fleet:50, invest:24, motor:200, energy:470, range:300, charge:'3–4 h',
  cap:70, batteries:5, routes:'8 & 9', body:'MCV', target:2035,
};

/* ---------- resilience / notable operational events ---------- */
const EVENTS = [
  { y:2018, tag:'Weather', t:'“The Beast from the East”', d:'A severe snowstorm forces a near-total suspension of services for days — one of the rare full network shutdowns in living memory.' },
  { y:2020, tag:'Pandemic', t:'COVID-19', d:'Ridership falls by more than 60% overnight; timetables are cut to a skeleton and Perspex screens and capacity limits are fitted across the fleet.' },
  { y:2022, tag:'Workforce', t:'Driver shortage', d:'A UK-wide shortage of drivers thins timetables; Lothian responds by recruiting 413 new drivers in 2023 alone.' },
  { y:2023, tag:'Disruption', t:'Roadworks & diversions', d:'Tram-to-Newhaven works and city-centre closures force long diversions, with the busy Leith corridor among the most affected.' },
  { y:2024, tag:'Safety', t:'Camera-mirror fleet', d:'New electric and hybrid deckers adopt camera-based mirror systems, improving the driver’s field of view in poor conditions.' },
];
const SAFETY = [
  ['100%','low-floor, step-free fleet'],
  ['Euro6','minimum emissions standard since 2020'],
  ['AV','audio-visual “next stop” on the fleet'],
  ['2 / bus','wheelchair spaces on new deckers'],
];

return { STATS, BRANDS, TIMELINE, FLEET, ROUTES, ROSTER, RIDERSHIP, REVENUE, DIVIDEND, OWNERS, FUELMIX, BZL, EVENTS, SAFETY };
})();
