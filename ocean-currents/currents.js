// ============================================================
// Rivers in the Sea — data layer
// Hand-authored polylines for the world's major surface currents,
// the deep (conveyor) return paths, and the climate data used by
// the charts. Coordinates are [lon, lat] waypoints; the field
// builder (field.js) turns them into a smooth global velocity grid.
//
// `speed`  — representative peak surface speed, m/s (drives particle pace)
// `width`  — half-width of influence, degrees of arc
// `sv`     — volume transport in sverdrups (1 Sv = 1,000,000 m³/s), display only
// `type`   — "warm" | "cold" | "mixed" (colour), deep currents are "deep"
// ============================================================

window.OC_CURRENTS = [
  // ---------- North Atlantic ----------
  {
    id: "gulf", name: "Gulf Stream", type: "warm", speed: 2.0, width: 3.2,
    sv: "30 Sv at Florida, ~150 Sv off Newfoundland",
    pts: [[-81.2,24.6],[-80.0,26.5],[-78.8,28.8],[-76.5,31.5],[-74.8,33.8],[-71.5,36.0],[-66.0,38.0],[-58.0,39.5],[-50.0,41.5]],
    label: [-70,36.8],
    blurb: "The western boundary current of the North Atlantic gyre — a ribbon of tropical water 100 km wide moving up to 2.5 m/s. It carries more than a hundred times the flow of every river on Earth combined."
  },
  {
    id: "nac", name: "North Atlantic Current", type: "warm", speed: 0.8, width: 4.0,
    sv: "~30 Sv",
    pts: [[-50.0,41.5],[-44.0,45.5],[-37.0,48.5],[-29.0,50.5],[-22.0,52.0],[-15.0,53.0]],
    label: [-32,50.5],
    blurb: "The Gulf Stream's broad, branching continuation across the mid-Atlantic. This is the water that keeps north-west Europe 5–10 °C warmer than its latitude deserves."
  },
  {
    id: "norwegian", name: "Norwegian Atlantic Current", type: "warm", speed: 0.5, width: 3.0,
    sv: "~8 Sv",
    pts: [[-13.0,54.5],[-8.0,58.0],[-3.0,61.0],[3.0,64.0],[9.0,68.0],[15.0,71.0],[22.0,73.0]],
    label: [3,64.5],
    blurb: "Atlantic water streaming past Scotland and along the Norwegian coast to the Arctic, keeping harbours ice-free beyond the Arctic Circle. Its heat is surrendered to the winter air — and that loss is what makes the water dense enough to sink."
  },
  {
    id: "irminger", name: "Irminger Current", type: "warm", speed: 0.4, width: 2.6,
    sv: "~10 Sv",
    pts: [[-16.0,58.0],[-22.0,60.5],[-28.0,62.5],[-34.0,63.5],[-40.0,62.0]],
    label: [-28,63.3],
    blurb: "The westward branch of the North Atlantic Current, wrapping around Iceland toward Greenland — part of the subpolar gyre where much of the Atlantic's sinking happens."
  },
  {
    id: "egc", name: "East Greenland Current", type: "cold", speed: 0.5, width: 2.6,
    sv: "~20 Sv incl. sea ice export",
    pts: [[-8.0,79.5],[-14.0,75.5],[-20.0,71.0],[-27.0,67.0],[-36.0,62.5],[-42.0,60.0]],
    label: [-24,69.5],
    blurb: "The Arctic's main exit: cold, fresh polar water and sea ice funnelled down Greenland's east coast. Its freshwater is a lever on the whole Atlantic overturning — dilute the subpolar seas and the sinking weakens."
  },
  {
    id: "wgc", name: "West Greenland Current", type: "mixed", speed: 0.4, width: 2.2,
    sv: "~5 Sv",
    pts: [[-45.0,59.8],[-50.0,61.5],[-53.0,64.0],[-55.0,67.0],[-57.0,70.0]],
    label: [-54,65.5],
    blurb: "Rounds Cape Farewell and heads north into the Labrador Sea, carrying both polar melt and a remnant of Irminger warmth along Greenland's west coast."
  },
  {
    id: "labrador", name: "Labrador Current", type: "cold", speed: 0.5, width: 2.8,
    sv: "~7 Sv",
    pts: [[-58.0,64.0],[-61.0,60.0],[-58.0,55.0],[-54.0,51.0],[-51.0,47.5],[-50.0,44.0]],
    label: [-55,53.5],
    blurb: "Icy water (and icebergs — including the Titanic's) sliding south past Labrador and Newfoundland. Where it meets the Gulf Stream over the Grand Banks it brews some of the world's densest sea fog."
  },
  {
    id: "canary", name: "Canary Current", type: "cold", speed: 0.3, width: 3.5,
    sv: "~3 Sv",
    pts: [[-11.0,41.0],[-13.0,36.0],[-15.0,31.0],[-17.0,26.0],[-18.0,21.0],[-17.5,16.0]],
    label: [-16.5,28],
    blurb: "The cool eastern limb of the North Atlantic gyre, sliding down past Iberia and Morocco. Eastern-boundary currents like this are broad, slow and shallow — the mirror image of the Gulf Stream."
  },
  {
    id: "natl-neq", name: "North Equatorial Current (Atlantic)", type: "warm", speed: 0.4, width: 3.5,
    sv: "~15 Sv",
    pts: [[-19.0,14.0],[-28.0,13.5],[-38.0,13.0],[-48.0,12.5],[-56.0,12.0]],
    label: [-38,15.2],
    blurb: "The trade winds' handiwork: a steady westward drift across the tropical Atlantic that feeds the Caribbean and, eventually, the Gulf Stream."
  },
  {
    id: "caribbean", name: "Caribbean & Loop Current", type: "warm", speed: 0.8, width: 2.6,
    sv: "~28 Sv",
    pts: [[-60.0,13.0],[-68.0,14.0],[-75.0,15.5],[-81.0,17.5],[-85.5,20.0],[-86.5,23.5],[-84.0,24.5],[-81.8,24.3]],
    label: [-78,17.5],
    blurb: "Trade-wind water squeezing through the Caribbean and looping around the Gulf of Mexico, gathering heat before it exits the Florida Strait as the Gulf Stream."
  },
  {
    id: "necc-atl", name: "Equatorial Counter Current (Atlantic)", type: "warm", speed: 0.4, width: 2.2,
    sv: "~10 Sv",
    pts: [[-45.0,5.0],[-36.0,5.5],[-27.0,6.0],[-18.0,5.5],[-10.0,4.5]],
    label: [-27,7.6],
    blurb: "A narrow eastward return flow squeezed between the westward equatorial currents, running against the trade winds in the doldrums."
  },
  {
    id: "seq-atl", name: "South Equatorial Current (Atlantic)", type: "warm", speed: 0.5, width: 3.5,
    sv: "~20 Sv",
    pts: [[8.0,-4.0],[-2.0,-5.0],[-12.0,-6.0],[-22.0,-7.5],[-31.0,-9.0]],
    label: [-12,-3.4],
    blurb: "Westward flow along and south of the equator. Where it strikes the shoulder of Brazil it splits — some north to the Caribbean, some south to become the Brazil Current."
  },
  {
    id: "brazil", name: "Brazil Current", type: "warm", speed: 0.6, width: 2.8,
    sv: "~10–20 Sv",
    pts: [[-34.5,-11.0],[-37.0,-16.0],[-40.0,-22.0],[-45.0,-28.0],[-50.0,-34.0],[-54.0,-39.0]],
    label: [-44,-26],
    blurb: "The South Atlantic's warm western boundary current — the Gulf Stream's gentler southern cousin, running down the Brazilian coast to its stormy meeting with the Malvinas Current."
  },
  {
    id: "malvinas", name: "Malvinas (Falkland) Current", type: "cold", speed: 0.6, width: 2.4,
    sv: "~40 Sv",
    pts: [[-64.0,-55.0],[-62.0,-50.0],[-59.0,-45.0],[-56.0,-41.0],[-54.5,-38.0]],
    label: [-60,-46],
    blurb: "A cold jet peeled off the Antarctic Circumpolar Current, racing north along Patagonia. Its head-on collision with the Brazil Current makes one of the most turbulent patches of ocean anywhere."
  },
  {
    id: "benguela", name: "Benguela Current", type: "cold", speed: 0.3, width: 3.2,
    sv: "~20 Sv",
    pts: [[17.5,-34.0],[14.0,-30.0],[11.5,-25.0],[10.0,-19.0],[9.0,-13.0]],
    label: [12.5,-24],
    blurb: "Cold upwelled water flowing up Africa's south-west coast. The chilled air above it barely rains — the Namib desert runs right down to this shoreline."
  },
  {
    id: "agulhas", name: "Agulhas Current", type: "warm", speed: 1.8, width: 2.6,
    sv: "~70 Sv",
    pts: [[36.0,-24.0],[34.0,-28.0],[31.0,-32.0],[27.0,-35.0],[22.0,-37.0],[19.5,-38.5]],
    label: [30,-34],
    blurb: "The Indian Ocean's mighty western boundary current, hurtling down Africa's east coast at up to 2 m/s. Against a westerly gale it raises freak waves that have broken supertankers."
  },
  {
    id: "agulhas-ret", name: "Agulhas Return Current", type: "warm", speed: 0.9, width: 2.4,
    sv: "most of the Agulhas' flow",
    pts: [[20.0,-40.0],[26.0,-41.0],[34.0,-40.5],[42.0,-40.0],[50.0,-40.5]],
    label: [36,-43],
    blurb: "At the tip of Africa the Agulhas snaps back on itself — the “retroflection” — and returns east. But giant rings of warm, salty water pinch off and escape into the Atlantic: a leak that helps fuel the overturning."
  },
  {
    id: "satl", name: "South Atlantic Current", type: "mixed", speed: 0.4, width: 3.5,
    sv: "~30 Sv",
    pts: [[-48.0,-40.0],[-35.0,-41.0],[-20.0,-41.5],[-5.0,-41.0],[8.0,-39.5]],
    label: [-20,-38.6],
    blurb: "The eastward southern limb of the South Atlantic gyre, running just north of the circumpolar storm belt."
  },

  // ---------- North Pacific ----------
  {
    id: "kuroshio", name: "Kuroshio", type: "warm", speed: 1.8, width: 3.0,
    sv: "~40–65 Sv",
    pts: [[122.0,21.5],[123.5,25.0],[127.0,28.5],[131.5,31.5],[136.5,33.5],[141.0,35.0],[148.0,36.0],[155.0,36.5]],
    label: [136,31.6],
    blurb: "“The Black Stream” — the Pacific's Gulf Stream, so deep-blue it looks black from a ship. It carries tropical warmth past Japan and moderates winters across the North Pacific rim."
  },
  {
    id: "oyashio", name: "Oyashio", type: "cold", speed: 0.5, width: 2.6,
    sv: "~7 Sv",
    pts: [[157.0,53.0],[153.0,49.0],[149.0,45.5],[146.0,42.5],[143.5,39.5]],
    label: [150,47],
    blurb: "“The Parent Stream”, cold and rich, flowing down from the Bering Sea and Kamchatka to meet the Kuroshio off Japan in a swirling, fog-prone frontier of eddies."
  },
  {
    id: "npc", name: "North Pacific Current", type: "mixed", speed: 0.3, width: 4.5,
    sv: "~30 Sv",
    pts: [[155.0,38.0],[170.0,40.0],[-175.0,41.5],[-160.0,43.0],[-145.0,44.5],[-133.0,45.5]],
    label: [-172,44.5],
    blurb: "The slow eastward drift spanning the entire North Pacific — the conveyor between Japan and North America, and the highway ridden by the famous 1992 bath-toy flotilla."
  },
  {
    id: "california", name: "California Current", type: "cold", speed: 0.25, width: 3.2,
    sv: "~10 Sv",
    pts: [[-126.0,44.0],[-125.0,39.0],[-122.5,34.0],[-119.0,29.0],[-114.0,24.0]],
    label: [-126,34],
    blurb: "Cool water sliding down the US west coast, with summer upwelling that chills the shore — the reason San Francisco shivers in fog while inland valleys bake."
  },
  {
    id: "alaska", name: "Alaska Current", type: "warm", speed: 0.4, width: 3.0,
    sv: "~15 Sv",
    pts: [[-134.0,48.5],[-137.0,52.0],[-141.0,55.5],[-147.0,58.5],[-153.0,58.5],[-160.0,56.0]],
    label: [-143,54],
    blurb: "The northern branch of the North Pacific Current, curling anticlockwise around the Gulf of Alaska. It is why Sitka, Alaska has milder winters than Moscow — twelve degrees of latitude further south."
  },
  {
    id: "neq-pac", name: "North Equatorial Current (Pacific)", type: "warm", speed: 0.4, width: 4.0,
    sv: "~45 Sv",
    pts: [[-108.0,12.5],[-125.0,13.0],[-145.0,13.5],[-165.0,14.0],[175.0,14.0],[155.0,13.5],[138.0,13.0]],
    label: [-165,16.2],
    blurb: "The trade-wind conveyor of the Pacific, gathering water across 13,000 km and delivering it to the Philippines, where it splits to feed the Kuroshio."
  },
  {
    id: "necc-pac", name: "Equatorial Counter Current (Pacific)", type: "warm", speed: 0.5, width: 2.4,
    sv: "~20 Sv",
    pts: [[135.0,4.8],[152.0,5.2],[170.0,5.6],[-172.0,5.8],[-152.0,5.5],[-132.0,5.2],[-112.0,4.8]],
    label: [-172,8],
    blurb: "The eastward seam between the Pacific's two westward equatorial streams. During El Niño it swells, helping warm water slosh back east."
  },
  {
    id: "seq-pac", name: "South Equatorial Current (Pacific)", type: "warm", speed: 0.5, width: 4.0,
    sv: "~50 Sv",
    pts: [[-85.0,-2.5],[-105.0,-3.5],[-125.0,-4.5],[-145.0,-5.5],[-165.0,-6.5],[178.0,-7.5],[165.0,-8.5]],
    label: [-145,-2],
    blurb: "Westward flow straddling the equator, piling warm water into the West Pacific “warm pool” — the hemisphere-sized reservoir whose sloshing is El Niño and La Niña."
  },
  {
    id: "eac", name: "East Australian Current", type: "warm", speed: 1.0, width: 2.6,
    sv: "~20–35 Sv",
    pts: [[152.0,-22.0],[154.0,-27.0],[153.5,-31.5],[151.5,-35.5],[150.0,-39.0]],
    label: [158,-31],
    blurb: "The warm western boundary current of the South Pacific, spinning off great eddies down Australia's east coast — and extending measurably further south each decade as the ocean warms."
  },
  {
    id: "humboldt", name: "Humboldt (Peru) Current", type: "cold", speed: 0.35, width: 3.2,
    sv: "~18 Sv",
    pts: [[-75.0,-42.0],[-74.0,-35.0],[-72.5,-28.0],[-74.0,-20.0],[-78.0,-12.0],[-82.0,-6.0]],
    label: [-79,-20],
    blurb: "The coldest, driest eastern boundary current of all, hugging South America. Above it sits the Atacama — the driest desert on Earth; offshore, its upwelling stops dead when El Niño strikes."
  },
  {
    id: "leeuwin", name: "Leeuwin Current", type: "warm", speed: 0.4, width: 2.0,
    sv: "~3 Sv",
    pts: [[113.0,-23.0],[112.5,-27.0],[114.0,-31.0],[116.0,-34.0],[120.0,-35.5],[127.0,-35.5]],
    label: [107,-28],
    blurb: "The great exception: a *warm* current flowing poleward down an *eastern* boundary, pushed by pressure from the Indonesian throughflow. It is why Western Australia has no cold-water upwelling desert coast."
  },

  // ---------- Indian Ocean ----------
  {
    id: "somali", name: "Somali Current", type: "mixed", speed: 1.5, width: 2.6,
    sv: "up to ~37 Sv in summer",
    pts: [[41.5,-3.0],[44.0,1.5],[47.5,5.5],[51.0,9.5],[54.0,12.5]],
    label: [51,4],
    blurb: "The ocean's quick-change artist: it runs north in the summer monsoon at up to 3.5 m/s, then reverses completely when the winter monsoon arrives — the only major current that flips direction twice a year."
  },
  {
    id: "seq-ind", name: "South Equatorial Current (Indian)", type: "warm", speed: 0.4, width: 3.5,
    sv: "~40 Sv",
    pts: [[100.0,-13.0],[88.0,-13.5],[75.0,-14.0],[62.0,-14.0],[50.0,-13.0]],
    label: [75,-10.6],
    blurb: "Trade-wind flow across the Indian Ocean, splitting at Madagascar to feed the Mozambique Channel eddies and, ultimately, the Agulhas."
  },
  {
    id: "mozambique", name: "Mozambique Current", type: "warm", speed: 0.6, width: 2.4,
    sv: "~15 Sv (as trains of eddies)",
    pts: [[41.5,-12.0],[40.5,-16.0],[38.5,-20.0],[36.5,-24.0],[35.5,-27.0]],
    label: [34,-19],
    blurb: "Less a steady river than a parade of giant eddies rolling down the Mozambique Channel toward the Agulhas."
  },
  {
    id: "wac", name: "West Australian Current", type: "cold", speed: 0.2, width: 3.0,
    sv: "~5 Sv",
    pts: [[110.0,-36.0],[108.5,-30.0],[108.0,-24.0],[109.0,-18.0]],
    label: [103,-25],
    blurb: "The weak, cool offshore limb of the Indian Ocean gyre — kept away from the coast itself by the warm Leeuwin Current running the other way inshore."
  },

  // ---------- Southern Ocean ----------
  {
    id: "acc", name: "Antarctic Circumpolar Current", type: "cold", speed: 0.5, width: 5.0, closed: true,
    sv: "~135–175 Sv — the largest current on Earth",
    pts: [[0.0,-51.0],[25.0,-49.0],[50.0,-48.0],[75.0,-50.0],[100.0,-52.0],[125.0,-54.0],[150.0,-56.0],[175.0,-58.0],[-160.0,-59.0],[-135.0,-58.0],[-110.0,-57.0],[-90.0,-58.0],[-72.0,-59.5],[-62.0,-58.0],[-50.0,-54.0],[-35.0,-52.0],[-20.0,-51.0]],
    label: [75,-56],
    blurb: "The only current that circles the planet unbroken, driven by the fiercest winds at sea. It moves well over a hundred sverdrups — more than a hundred Amazons — and it is the junction box connecting the Atlantic, Pacific and Indian oceans."
  },

  // ---------- Arctic ----------
  {
    id: "transpolar", name: "Transpolar Drift", type: "cold", speed: 0.1, width: 4.5,
    sv: "sea ice and surface water",
    pts: [[150.0,78.0],[170.0,82.0],[-170.0,85.5],[-60.0,87.0],[-15.0,83.0],[-8.0,80.0]],
    label: [-130,86],
    blurb: "A slow conveyor of sea ice from Siberia across the pole toward the Fram Strait — the drift Nansen deliberately froze his ship *Fram* into in 1893 to ride across the Arctic."
  },
];

// ---------- Deep circulation (the conveyor's lower limb) ----------
window.OC_DEEP = [
  {
    id: "nadw", name: "North Atlantic Deep Water", type: "deep", speed: 0.15, width: 5.0,
    sv: "~17 Sv formed",
    pts: [[-35.0,58.0],[-42.0,50.0],[-45.0,40.0],[-42.0,28.0],[-36.0,15.0],[-32.0,0.0],[-28.0,-15.0],[-20.0,-30.0],[-8.0,-42.0],[5.0,-48.0]],
    label: [-38,20],
    blurb: "Water that sank in the Nordic and Labrador seas, now creeping south along the Atlantic floor 2–4 km down. It will not see the sky again for centuries."
  },
  {
    id: "deep-acc", name: "Deep circumpolar flow", type: "deep", speed: 0.12, width: 6.0, closed: true,
    sv: "mixes all deep waters",
    pts: [[10.0,-52.0],[40.0,-50.0],[70.0,-52.0],[100.0,-54.0],[130.0,-56.0],[160.0,-58.0],[-170.0,-59.0],[-140.0,-58.0],[-110.0,-58.0],[-80.0,-59.0],[-55.0,-56.0],[-30.0,-53.0],[-10.0,-52.0]],
    label: [140,-62],
    blurb: "In the Southern Ocean the deep waters of all three basins are stirred together and re-dealt — some rising back to the surface, some spun off north into the Indian and Pacific."
  },
  {
    id: "deep-ind", name: "Deep inflow, Indian Ocean", type: "deep", speed: 0.1, width: 5.0,
    sv: "~10 Sv rising",
    pts: [[60.0,-48.0],[70.0,-35.0],[78.0,-20.0],[82.0,-5.0],[85.0,8.0]],
    label: [88,-14],
    blurb: "Deep water drifting north into the Indian Ocean, gradually mixed upward by tides and turbulence over rough seafloor."
  },
  {
    id: "deep-pac", name: "Deep inflow, Pacific Ocean", type: "deep", speed: 0.1, width: 6.0,
    sv: "~15 Sv rising",
    pts: [[170.0,-50.0],[178.0,-35.0],[-178.0,-18.0],[-172.0,0.0],[-168.0,18.0],[-170.0,35.0]],
    label: [-175,26],
    blurb: "The longest leg of the loop: deep water spreading north through the Pacific, surfacing perhaps a thousand years after it left the North Atlantic sky. The oldest water in the ocean is here."
  },
  {
    id: "return-itf", name: "Warm return route", type: "deep-return", speed: 0.2, width: 4.0,
    sv: "~15 Sv Indonesian Throughflow",
    pts: [[-175.0,8.0],[170.0,4.0],[150.0,0.0],[133.0,-3.0],[120.0,-8.0],[108.0,-12.0],[95.0,-13.5],[80.0,-14.0],[65.0,-14.0],[50.0,-13.0],[41.0,-16.0],[36.0,-25.0],[27.0,-35.0],[20.0,-38.0],[10.0,-33.0],[2.0,-25.0],[-8.0,-15.0],[-20.0,-5.0],[-32.0,5.0],[-45.0,12.0],[-60.0,13.0],[-75.0,15.5],[-85.0,20.0],[-81.0,25.0],[-75.0,33.0],[-65.0,38.0],[-50.0,42.0],[-35.0,48.0],[-20.0,54.0],[-10.0,58.0]],
    label: [110,-16],
    blurb: "The upper limb of the conveyor: upwelled water threading the Indonesian archipelago, riding the Agulhas around Africa, crossing the equator and finally running the Gulf Stream–North Atlantic route back to the sinking grounds."
  },
];

// Where the conveyor descends and rises (markers in deep mode)
window.OC_SINKS = [
  { name: "Nordic Seas sinking", lon: -2, lat: 72 },
  { name: "Labrador Sea sinking", lon: -54, lat: 58.5 },
  { name: "Weddell Sea sinking", lon: -40, lat: -66 },
  { name: "Ross Sea sinking", lon: 178, lat: -73 },
];
window.OC_RISES = [
  { name: "Diffuse upwelling, N. Pacific", lon: -170, lat: 38 },
  { name: "Diffuse upwelling, Indian", lon: 85, lat: 10 },
  { name: "Southern Ocean divergence", lon: 120, lat: -60 },
];

// ---------- The five gyres (for the gyre explainer) ----------
window.OC_GYRES = [
  { id: "natl", name: "North Atlantic Gyre", turn: "clockwise", center: [-40, 30],
    ids: ["gulf","nac","canary","natl-neq","caribbean"],
    blurb: "Gulf Stream → North Atlantic Current → Canary → North Equatorial. Its calm centre is the Sargasso Sea." },
  { id: "satl", name: "South Atlantic Gyre", turn: "anticlockwise", center: [-15, -30],
    ids: ["brazil","satl","benguela","seq-atl"],
    blurb: "Brazil → South Atlantic → Benguela → South Equatorial." },
  { id: "npac", name: "North Pacific Gyre", turn: "clockwise", center: [-160, 30],
    ids: ["kuroshio","npc","california","neq-pac"],
    blurb: "Kuroshio → North Pacific → California → North Equatorial. Its convergent centre collects the “garbage patch”." },
  { id: "spac", name: "South Pacific Gyre", turn: "anticlockwise", center: [-120, -30],
    ids: ["eac","humboldt","seq-pac"],
    blurb: "East Australian → (eastward drift) → Humboldt → South Equatorial. The gyre centre is the remotest water on Earth." },
  { id: "sind", name: "Indian Ocean Gyre", turn: "anticlockwise", center: [75, -30],
    ids: ["agulhas","agulhas-ret","wac","seq-ind","mozambique"],
    blurb: "Agulhas → Agulhas Return → West Australian → South Equatorial." },
];

// ---------- Same-latitude cities (55–59 °N), January & July means, °C ----------
// Standard 1991–2020-era climatology, rounded. `jan`/`jul` are monthly means.
window.OC_CITIES = [
  { name: "Sitka, Alaska",        lon: -135.3, lat: 57.1, jan:  1.6, jul: 13.7, note: "warmed by the Alaska Current" },
  { name: "Juneau, Alaska",       lon: -134.4, lat: 58.3, jan: -1.2, jul: 14.2, note: "coastal, current-tempered" },
  { name: "Churchill, Canada",    lon:  -94.2, lat: 58.8, jan: -25.6, jul: 12.7, note: "Hudson Bay: no warm current, sea ice" },
  { name: "Nain, Labrador",       lon:  -61.7, lat: 56.5, jan: -17.5, jul: 10.0, note: "chilled by the Labrador Current" },
  { name: "Glasgow, Scotland",    lon:   -4.3, lat: 55.9, jan:  4.0, jul: 15.5, note: "North Atlantic Current offshore" },
  { name: "Aberdeen, Scotland",   lon:   -2.1, lat: 57.2, jan:  3.8, jul: 15.0, note: "North Sea, Atlantic-warmed" },
  { name: "Gothenburg, Sweden",   lon:   12.0, lat: 57.7, jan: -0.5, jul: 18.0, note: "Atlantic influence fading" },
  { name: "Riga, Latvia",         lon:   24.1, lat: 57.0, jan: -2.9, jul: 18.2, note: "Baltic, semi-continental" },
  { name: "Moscow, Russia",       lon:   37.6, lat: 55.8, jan: -6.5, jul: 19.7, note: "continental" },
  { name: "Kazan, Russia",        lon:   49.1, lat: 55.8, jan: -10.4, jul: 20.2, note: "deep continental" },
  { name: "Omsk, Russia",         lon:   73.4, lat: 55.0, jan: -16.3, jul: 19.6, note: "Siberian" },
  { name: "Novosibirsk, Russia",  lon:   82.9, lat: 55.0, jan: -16.2, jul: 19.4, note: "Siberian" },
  { name: "Magadan, Russia",      lon:  150.8, lat: 59.6, jan: -16.4, jul: 12.5, note: "cold Sea of Okhotsk" },
];

// ---------- Scotland monthly climatology (eastern Scotland / Edinburgh, °C) ----------
window.OC_SCOT_MONTHLY = {
  months: ["J","F","M","A","M","J","J","A","S","O","N","D"],
  baseline: [4.2, 4.4, 6.0, 8.0, 10.9, 13.6, 15.5, 15.3, 13.0, 9.8, 6.6, 4.3],
};

// ---------- Drift-lab presets (all physical-drift stories) ----------
window.OC_DRIFT_PRESETS = [
  { name: "Bath toys, mid-Pacific 1992", lon: 178.0, lat: 44.7,
    note: "The Ever Laurel container spill: 28,800 plastic bath toys, tracked across the Pacific for two decades." },
  { name: "Bottle off New York", lon: -71.0, lat: 39.0,
    note: "A classic message-in-a-bottle start: into the Gulf Stream and across to Europe." },
  { name: "Container off Cornwall", lon: -7.5, lat: 49.0,
    note: "In 1997 a container of 4.8 million Lego pieces went over near here; pieces still wash up." },
  { name: "Trainers off Alaska, 1990", lon: -178.0, lat: 48.0,
    note: "61,000 Nike shoes overboard — oceanographers used serial numbers to map the North Pacific gyre." },
  { name: "Buoy off Cape Town", lon: 15.0, lat: -36.0,
    note: "Ride the Agulhas leakage north through the South Atlantic." },
  { name: "Ice off Ilulissat", lon: -52.0, lat: 68.5,
    note: "The berg route: down the Labrador Current toward the Grand Banks — the Titanic's iceberg came this way." },
];

// Shared colour vocabulary (kept in one place; CSS mirrors these)
window.OC_COLORS = {
  warm: "#ff9d5c", cold: "#54c8ff", mixed: "#cfc593",
  deep: "#8f7fe8", "deep-return": "#ffb37a",
  land: "#1b2836", landEdge: "#2e4257", ocean: "#0a1420",
  grid: "rgba(120,160,200,0.10)",
};
