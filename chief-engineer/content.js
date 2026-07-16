// Chief Engineer — declarative content: ships, levels, events, manual, tuning.
// Pure data (no closures) so engine state stays snapshot-safe.

export const TUNING = {
  sfocBase: 174, // g/kWh at 80% load
  sfocCurve: 0.6, // sfoc = base + curve*(l-0.8)^2*100
  dgStartTicks: 3,
  switchoverTicks: 45,
  overloadTripTicks: 6,
  shedEveryTicks: 2,
  baseWearPerHour: 0.02,
  sumpFallPerHour: 0.25,
  sumpSloshThreshold: 50,
  sloshTripChancePerMin: 0.02,
  catFinesRise: 5, // per hour while purifier down on HFO
  catFinesRecover: 4,
  priceHFO: 450, // €/t
  priceMGO: 720,
  pscFinePerDeficiency: 5000,
  ecaFinePerMin: 20,
  weatherComfortDrain: { rough: 0.05, storm: 0.12 },
};

// ------------------------------------------------------------------ ships --

export const SHIPS = {
  aurora: {
    name: "MV Aurora", pax: 200, teams: 1,
    boards: [{ id: "MSB" }],
    dgs: [
      { id: "DG1", board: "MSB", mw: 2.2, initialHours: 12400 },
      { id: "DG2", board: "MSB", mw: 2.2, initialHours: 9800 },
      { id: "DG3", board: "MSB", mw: 2.2, initialHours: 15100 },
    ],
    hotelMw: 1.5, propMw: 2.4, serviceKn: 13, maxKn: 14.5, auxMw: 0.2, thrusterMw: 0.4,
    tankCap: { HFO: 0, MGO: 120 },
    systems: ["steering"],
    propSplit: { MSB: 1 },
  },
  baltica: {
    name: "MV Baltica", pax: 700, teams: 1,
    boards: [{ id: "MSB" }],
    dgs: [
      { id: "DG1", board: "MSB", mw: 5.0, initialHours: 21000 },
      { id: "DG2", board: "MSB", mw: 5.0, initialHours: 18400 },
      { id: "DG3", board: "MSB", mw: 5.0, initialHours: 24100, initialCondition: 72 },
    ],
    hotelMw: 3.0, propMw: 6.5, serviceKn: 17, maxKn: 19, auxMw: 0.3, thrusterMw: 0.8,
    tankCap: { HFO: 0, MGO: 400 },
    systems: ["steering", "sewage"],
    propSplit: { MSB: 1 },
  },
  meridian: {
    name: "MS Meridian", pax: 1500, teams: 2,
    boards: [{ id: "MSB" }],
    dgs: [
      { id: "DG1", board: "MSB", mw: 8, initialHours: 31000 },
      { id: "DG2", board: "MSB", mw: 8, initialHours: 28800, initialCondition: 68 },
      { id: "DG3", board: "MSB", mw: 8, initialHours: 33500 },
      { id: "DG4", board: "MSB", mw: 8, initialHours: 26200 },
    ],
    hotelMw: 8, propMw: 15, serviceKn: 20, maxKn: 22, auxMw: 0.5, thrusterMw: 1.6,
    tankCap: { HFO: 900, MGO: 250 },
    systems: ["steering", "sewage", "purifier", "boiler", "freshwater"],
    propSplit: { MSB: 1 },
  },
  atlantica: {
    name: "MS Atlantica", pax: 2600, teams: 2, scrubber: true,
    boards: [{ id: "ER1" }, { id: "ER2" }],
    dgs: [
      { id: "DG11", board: "ER1", mw: 12, initialHours: 42000 },
      { id: "DG12", board: "ER1", mw: 12, initialHours: 39500, initialSump: 46 },
      { id: "DG21", board: "ER2", mw: 12, initialHours: 44100, initialSump: 44 },
      { id: "DG22", board: "ER2", mw: 12, initialHours: 36800 },
    ],
    hotelMw: 9, propMw: 25, serviceKn: 21.5, maxKn: 23.5, auxMw: 0.8, thrusterMw: 3,
    tankCap: { HFO: 1400, MGO: 350 },
    systems: ["steering", "sewage", "purifier", "boiler", "freshwater", "stabilizers"],
    propSplit: { ER1: 0.5, ER2: 0.5 },
  },
  caribia: {
    name: "MS Caribia", pax: 4200, teams: 3, scrubber: true,
    boards: [{ id: "ER1" }, { id: "ER2" }],
    dgs: [
      { id: "DG51", board: "ER1", mw: 14, initialHours: 51000 },
      { id: "DG52", board: "ER1", mw: 14, initialHours: 47800, initialCondition: 64 },
      { id: "DG53", board: "ER1", mw: 14, initialHours: 55300 },
      { id: "DG54", board: "ER2", mw: 14, initialHours: 49200 },
      { id: "DG55", board: "ER2", mw: 14, initialHours: 52600 },
    ],
    hotelMw: 16, propMw: 30, serviceKn: 21, maxKn: 23, auxMw: 1.0, thrusterMw: 4,
    tankCap: { HFO: 2200, MGO: 450 },
    systems: ["steering", "sewage", "purifier", "boiler", "freshwater", "stabilizers", "chillers"],
    propSplit: { ER1: 0.5, ER2: 0.5 },
  },
  harmonia: {
    name: "MS Harmonia", pax: 6800, teams: 3, scrubber: true,
    boards: [{ id: "ER1" }, { id: "ER2" }],
    dgs: [
      { id: "DG61", board: "ER1", mw: 14.4, initialHours: 46000 },
      { id: "DG62", board: "ER1", mw: 19.2, initialHours: 41200 },
      { id: "DG63", board: "ER1", mw: 14.4, initialHours: 52400, initialSump: 47 },
      { id: "DG64", board: "ER2", mw: 14.4, initialHours: 48800, initialSump: 45 },
      { id: "DG65", board: "ER2", mw: 19.2, initialHours: 39700 },
      { id: "DG66", board: "ER2", mw: 14.4, initialHours: 50100, initialCondition: 70 },
    ],
    hotelMw: 20, propMw: 54, serviceKn: 22, maxKn: 24, auxMw: 1.5, thrusterMw: 5.5,
    tankCap: { HFO: 3000, MGO: 600 },
    systems: ["steering", "sewage", "purifier", "boiler", "freshwater", "stabilizers", "chillers"],
    propSplit: { ER1: 0.5, ER2: 0.5 },
  },
};

// ----------------------------------------------------------------- events --
// Phase durations in ticks (game-minutes). Warnings are LONG (hours) so they
// survive time compression; the speed auto-drop happens on the alarm anyway.
// interventions[]: ordered; `requires` enforces procedure order; the same
// list renders as the Manual's checklist and drives the playthrough bot.

export const EVENTS = {
  seachest: {
    title: "Sea chest fouling", tile: "cool", manual: "emergencies",
    phases: [
      { id: "warn", min: 150, severity: "amber", text: "{c} COOL SW PRESS LOW — SEA CHEST FOULING",
        interventions: [
          { id: "swap", label: "Change over to the other sea chest", log: "Sea suction swapped — SW pressure restored on {c}.", resolve: "resolved" },
        ] },
      { id: "hot", min: 45, severity: "red", text: "{c} HT JACKET TEMP HIGH",
        interventions: [
          { id: "swap", label: "Change over sea chest and reduce load", log: "Suction swapped late — {c} cooked a little.", effects: { parts: 2 }, resolve: "degraded" },
        ] },
      { id: "seize", min: 1, severity: "red", terminal: true, text: "{c} OVERTEMP SHUTDOWN — PISTON DAMAGE",
        effects: { tripDg: true, damageDg: 40, addJob: { title: "Rebuild {c} after overtemp", kind: "repair", durationMin: 360, partsCost: 18, critical: true } } },
    ],
  },
  injector: {
    title: "Fuel injector failure", tile: "inj", manual: "maintenance",
    phases: [
      { id: "dev", min: 180, severity: "amber", text: "{c} EXH TEMP DEVIATION HIGH (CYL 4 +55°C)",
        interventions: [
          { id: "cutout", label: "Cut out the unit and change the injector", log: "Unit cut out on {c}; injector changed.", effects: { parts: 3 }, resolve: "resolved" },
        ] },
      { id: "burn", min: 90, severity: "red", text: "{c} AFTERBURNING — EXH TEMPS CLIMBING",
        interventions: [
          { id: "cutout", label: "Cut out the unit and change the injector", log: "Injector changed on {c} — exhaust settling.", effects: { parts: 5 }, resolve: "degraded" },
        ] },
      { id: "valve", min: 1, severity: "red", terminal: true, text: "{c} EXHAUST VALVE BURNED THROUGH",
        effects: { tripDg: true, damageDg: 45, addJob: { title: "Renew {c} exhaust valve & piston crown", kind: "repair", durationMin: 480, partsCost: 25, critical: true } } },
    ],
  },
  turbo: {
    title: "Turbocharger vibration", tile: "tc", manual: "maintenance",
    phases: [
      { id: "vib", min: 150, severity: "amber", text: "{c} T/C VIBRATION HIGH — SURGING ON LOAD CHANGES",
        interventions: [
          { id: "derate", label: "Derate the engine and schedule overhaul", log: "{c} held at reduced load; turbocharger nursed.", effects: { parts: 2 }, resolve: "degraded" },
        ] },
      { id: "brg", min: 60, severity: "red", text: "{c} T/C LO PRESS LOW — BEARING FAILING",
        interventions: [
          { id: "stop", label: "Stop engine, lock the rotor", log: "{c} stopped before the rotor let go.", effects: { tripDg: true, addJob: { title: "Overhaul {c} turbocharger", kind: "repair", durationMin: 420, partsCost: 20, critical: true } }, resolve: "degraded" },
        ] },
      { id: "burst", min: 1, severity: "red", terminal: true, text: "{c} T/C ROTOR BURST — CASING WRECKED",
        effects: { tripDg: true, damageDg: 30, addJob: { title: "Replace {c} turbocharger", kind: "repair", durationMin: 600, partsCost: 40, critical: true } } },
    ],
  },
  "oil-mist": {
    title: "Crankcase oil mist", tile: "mist", manual: "emergencies",
    phases: [
      { id: "mist", min: 8, severity: "red", text: "OIL MIST DETECTOR {c} — STOP ENGINE NOW",
        interventions: [
          { id: "stop", label: "Stop the engine immediately, stand clear of relief doors", log: "{c} stopped. Crankcase left shut to cool — 30 minutes minimum.", effects: { tripDg: true, addJob: { title: "Inspect {c} crankcase for hot spot", kind: "repair", durationMin: 180, partsCost: 8, critical: true } }, resolve: "degraded" },
        ] },
      { id: "boom", min: 1, severity: "red", terminal: true, text: "{c} CRANKCASE EXPLOSION",
        effects: { tripDg: true, damageDg: 15, comfort: -10, spawn: { eventId: "er-fire" }, log: "Relief doors lifted on {c} — burning oil in the space." } },
    ],
  },
  "purifier-fail": {
    title: "Fuel purifier failure", tile: "pur", manual: "purifiers",
    phases: [
      { id: "sludge", min: 120, severity: "amber", text: "FO PURIFIER SLUDGE DISCHARGE FAIL",
        interventions: [
          { id: "clean", label: "Strip and clean the bowl, reset", log: "Purifier bowl cleaned; separation normal.", effects: { parts: 1 }, resolve: "resolved" },
        ] },
      { id: "down", min: 2, severity: "red", text: "FO PURIFIER STOPPED — CAT FINES UNTREATED",
        effects: { system: { id: "purifier", to: "down" }, addJob: { title: "Rebuild purifier (gear pump seized)", kind: "repair", system: "purifier", durationMin: 300, partsCost: 12, critical: true }, log: "Purifier down — burning HFO untreated. Watch the fuel-quality meter." },
        interventions: [] },
    ],
  },
  "boiler-flame": {
    title: "Boiler flame failure", tile: "blr", manual: "hotel",
    phases: [
      { id: "flameout", min: 90, severity: "amber", text: "AUX BOILER BURNER FLAME FAIL",
        interventions: [
          { id: "purge", label: "Purge the furnace (mandatory before re-fire)", log: "Furnace purged — 3 minutes of air through the box." },
          { id: "relight", label: "Re-ignite the burner", requires: ["purge"], refuseText: "NEVER re-fire without purging — unburned vapour explodes.", log: "Burner relit; steam pressure recovering.", resolve: "resolved" },
        ] },
      { id: "cold", min: 2, severity: "amber", text: "STEAM PRESSURE LOST — HFO TANK HEATING FAILING",
        effects: { system: { id: "boiler", to: "down" }, addJob: { title: "Overhaul burner management system", kind: "repair", system: "boiler", durationMin: 240, partsCost: 8 }, comfort: -4 },
        interventions: [] },
    ],
  },
  "chiller-trip": {
    title: "A/C chiller trip", tile: "hvac", manual: "hotel",
    phases: [
      { id: "trip", min: 60, severity: "amber", text: "CHILLER NO.2 TRIP — CHW TEMP RISING",
        interventions: [
          { id: "reset", label: "Reset the chiller and stagger restart", log: "Chiller reset — chilled water recovering.", resolve: "resolved" },
        ] },
      { id: "down", min: 2, severity: "amber", text: "CHILLED WATER PLANT DEGRADED — CABIN TEMPS CLIMBING",
        effects: { system: { id: "chillers", to: "down" }, addJob: { title: "Replace chiller compressor bearings", kind: "repair", system: "chillers", durationMin: 300, partsCost: 15 } },
        interventions: [] },
    ],
  },
  "sewage-vacuum": {
    title: "Vacuum sewage loss", tile: "sew", manual: "hotel",
    phases: [
      { id: "low", min: 60, severity: "amber", text: "VACUUM PRESS LOW — SEWAGE SYSTEM",
        interventions: [
          { id: "isolate", label: "Isolate the blocked branch, restart vacuum pumps", log: "Blockage isolated (wipes again). Vacuum restored.", resolve: "resolved" },
        ] },
      { id: "down", min: 2, severity: "red", text: "SEWAGE SYSTEM DOWN — TOILETS INOPERATIVE SHIP-WIDE",
        effects: { system: { id: "sewage", to: "down" }, addJob: { title: "Clear vacuum main & renew pump", kind: "repair", system: "sewage", durationMin: 240, partsCost: 6 } },
        interventions: [] },
    ],
  },
  "evap-low": {
    title: "Evaporator output low", tile: "fw", manual: "hotel",
    phases: [
      { id: "low", min: 120, severity: "amber", text: "FRESH WATER PRODUCTION LOW — EVAP SCALED",
        interventions: [
          { id: "acid", label: "Acid-clean the evaporator, run RO plant hard", log: "Evaporator cleaned; RO carrying the load meanwhile.", effects: { parts: 3 }, resolve: "resolved" },
        ] },
      { id: "ration", min: 2, severity: "amber", text: "POTABLE WATER RATIONING IN EFFECT",
        effects: { system: { id: "freshwater", to: "down" }, addJob: { title: "Retube evaporator", kind: "repair", system: "freshwater", durationMin: 360, partsCost: 10 } },
        interventions: [] },
    ],
  },
  steering: {
    title: "Steering gear pump failure", tile: "str", manual: "emergencies",
    phases: [
      { id: "phase", min: 20, severity: "red", text: "STEERING GEAR NO.1 PUMP PHASE FAILURE",
        interventions: [
          { id: "swap", label: "Start No.2 pump, switch over", log: "No.2 steering pump on — rudder control normal.", resolve: "resolved" },
        ] },
      { id: "hard", min: 1, severity: "red", terminal: true, text: "STEERING RESPONSE LOST — EMERGENCY STEERING RIGGED",
        effects: { comfort: -6, log: "Quartermasters steering from the flat by phone. Bridge is not amused." } },
    ],
  },
  "stab-fault": {
    title: "Stabilizer hydraulic fault", tile: "stab", manual: "weather",
    phases: [
      { id: "fault", min: 45, severity: "amber", text: "STABILIZER HYD PRESSURE LOW",
        interventions: [
          { id: "reset", label: "Change filters and reset the power pack", log: "Stabilizer hydraulics restored.", effects: { parts: 2 }, resolve: "resolved" },
        ] },
      { id: "housed", min: 2, severity: "amber", text: "STABILIZERS HOUSED — FINS UNAVAILABLE",
        effects: { system: { id: "stabilizers", to: "down" }, addJob: { title: "Renew stabilizer hydraulic pump", kind: "repair", system: "stabilizers", durationMin: 300, partsCost: 9 } },
        interventions: [] },
    ],
  },
  "fuel-leak": {
    title: "Fuel leak on engine", tile: "leak", manual: "fire",
    phases: [
      { id: "leak", min: 40, severity: "red", text: "{c} FO LEAK DETECTED — SPRAY NEAR HOT EXHAUST",
        interventions: [
          { id: "stop", label: "Stop {c} immediately", log: "{c} stopped.", effects: { tripDg: true } },
          { id: "isolate", label: "Isolate the fuel line and fit a new hose", requires: ["stop"], log: "Flexible hose renewed on {c} — should have had a spray shield years ago.", effects: { parts: 4, addJob: { title: "Fit spray shields — fleet order", kind: "service", durationMin: 120, partsCost: 3 } }, resolve: "degraded" },
        ] },
      { id: "fire", min: 1, severity: "red", terminal: true, text: "{c} FUEL SPRAY IGNITED",
        effects: { tripDg: true, spawn: { eventId: "er-fire" }, log: "Fuel mist found the exhaust lagging on {c}." } },
    ],
  },
  "er-fire": {
    title: "Engine room fire", tile: "fire", manual: "fire",
    // componentId = board id when spawned scripted; inherits DG's board otherwise
    phases: [
      { id: "fire", min: 14, severity: "red", text: "FIRE — MACHINERY SPACE — FLAME DETECTORS ZONE 3",
        interventions: [
          { id: "quickclose", label: "Pull quick-closing fuel valves & stop purifiers", log: "Quick-closing valves tripped. Fuel to the space cut." },
          { id: "vents", label: "Stop ventilation fans", requires: ["quickclose"], log: "Fans stopped — stop feeding it air." },
          { id: "dampers", label: "Close fire dampers", requires: ["vents"], log: "Dampers shut. The space is sealed." },
          { id: "evacuate", label: "Evacuate & muster the space (headcount)", requires: ["dampers"], log: "Space evacuated — all hands accounted for." },
          { id: "co2", label: "Release CO₂ (only after evacuation)", requires: ["evacuate"], refuseText: "NO — nobody releases CO₂ until the muster confirms the space is EMPTY.", log: "CO₂ released. Boundary cooling rigged. Now we wait and watch the bulkhead temps.", effects: { fireOut: true }, resolve: "degraded" },
        ] },
      { id: "spread", min: 1, severity: "red", terminal: true, text: "FIRE SPREAD TO CABLE RUNS — SWITCHBOARD LOST",
        effects: { fireBoardLoss: true, comfort: -20, log: "The cable trays above the fire burned through. Half the plant is gone." } },
    ],
  },
  "er-fire-major": {
    title: "Major engine room fire (ER2)", tile: "fire", manual: "fire",
    phases: [
      { id: "fire", min: 12, severity: "red", text: "FIRE — ER2 — MULTIPLE DETECTOR HEADS — HI-FOG RUNNING",
        interventions: [
          { id: "quickclose", label: "Pull quick-closing fuel valves & stop purifiers", log: "Quick-closing valves tripped." },
          { id: "vents", label: "Stop ventilation fans", requires: ["quickclose"], log: "Fans stopped." },
          { id: "dampers", label: "Close fire dampers", requires: ["vents"], log: "Dampers shut." },
          { id: "evacuate", label: "Evacuate & muster ER2", requires: ["dampers"], log: "ER2 evacuated — all hands accounted for." },
          { id: "co2", label: "Release CO₂ into ER2", requires: ["evacuate"], refuseText: "NO — muster first. CO₂ into a manned space kills.", log: "CO₂ flooded ER2. Fire is out — but the board and its cables are gone. Safe-return-to-port: we run home on ER1.", effects: { loseBoard: "ER2" }, resolve: "degraded" },
        ] },
      { id: "spread", min: 1, severity: "red", terminal: true, text: "ER2 FIRE OUT OF CONTROL — SPREADING FORWARD",
        effects: { loseBoard: "ER2", comfort: -25, playerFault: true, log: "Fought too slowly — ER2 destroyed and the forward bulkhead scorched." } },
    ],
  },
  "bilge-leak": {
    title: "Bilge flooding", tile: "blg", manual: "flooding",
    phases: [
      { id: "high", min: 45, severity: "amber", text: "BILGE WELL LEVEL HIGH — ER AFT",
        interventions: [
          { id: "pumps", label: "Start second bilge pump", log: "Both bilge pumps running — holding the level." },
          { id: "find", label: "Trace and isolate the ingress (sea chest gasket)", requires: ["pumps"], log: "Weeping sea-chest joint isolated and re-packed.", effects: { parts: 2 }, resolve: "resolved" },
        ] },
      { id: "highhigh", min: 25, severity: "red", text: "BILGE HIGH-HIGH — WATER OVER THE PLATES",
        interventions: [
          { id: "pumps", label: "Start second bilge pump", log: "Both bilge pumps running." },
          { id: "inject", label: "Open direct bilge injection on the main SW pump", requires: ["pumps"], log: "Direct injection pulling the level down fast." },
          { id: "find", label: "Trace and isolate the ingress", requires: ["inject"], log: "Ingress isolated. Plates draining.", effects: { parts: 3 }, resolve: "degraded" },
        ] },
      { id: "flood", min: 1, severity: "red", terminal: true, text: "FLOODING UNCONTROLLED — MOTORS SUBMERGED",
        effects: { comfort: -10, parts: 25, log: "Water reached the aft motor pits before we caught it." } },
    ],
  },
  "offspec-bunker": {
    title: "Off-spec bunkers", tile: "bnk", manual: "bunkering",
    phases: [
      { id: "lab", min: 240, severity: "amber", text: "LAB RESULT — BUNKER SAMPLE AL+SI 78 mg/kg (LIMIT 60)",
        interventions: [
          { id: "quarantine", label: "Quarantine the new tank; burn from the old stem", log: "New stem locked out. We burn the good oil and fight the supplier's paperwork.", resolve: "resolved" },
        ] },
      { id: "burned", min: 2, severity: "red", text: "CAT FINES IN SERVICE TANK — ABRASIVE WEAR",
        effects: { catFines: 45, log: "The off-spec stem reached the service tank. Liners will pay for this." },
        interventions: [] },
    ],
  },
  "scrubber-fault": {
    title: "Scrubber washwater fault", tile: "scr", manual: "eca",
    phases: [
      { id: "ph", min: 60, severity: "amber", text: "SCRUBBER WASHWATER pH OUT OF LIMITS",
        interventions: [
          { id: "mgo", label: "Stop scrubber & switch to MGO now", log: "Scrubber secured; changeover to gas oil running.", effects: { scrubberFault: true, addJob: { title: "Renew scrubber dosing pump", kind: "repair", scrubber: true, durationMin: 240, partsCost: 10 } }, resolve: "degraded" },
        ] },
      { id: "violation", min: 2, severity: "red", text: "SCRUBBER DISCHARGE NON-COMPLIANT",
        effects: { scrubberFault: true, fine: 8000, addJob: { title: "Renew scrubber dosing pump", kind: "repair", scrubber: true, durationMin: 240, partsCost: 10 } },
        interventions: [] },
    ],
  },
  "rogue-wave": {
    title: "Rogue wave", tile: "wave", manual: "weather",
    phases: [
      { id: "hit", min: 3, severity: "red", text: "EXTREME ROLL — GREEN WATER OVER THE BOW",
        effects: { rogue: true },
        interventions: [] },
    ],
  },
  "lo-slosh-warn": {
    title: "Low sumps before weather", tile: "lo", manual: "weather",
    phases: [
      { id: "warn", min: 600, severity: "amber", text: "LO SUMP LEVELS LOW FOR FORECAST SEA STATE",
        interventions: [
          { id: "note", label: "Acknowledge — plan top-ups before the storm", log: "Noted. Sumps at 28–47% will not tolerate heavy rolling (remember Viking Sky).", resolve: "resolved" },
        ] },
    ],
  },
};

// ----------------------------------------------------------------- levels --

export const LEVELS = [
  {
    id: "L1", name: "The Fjord Run", ship: "aurora",
    startGrade: "MGO", startFuel: { HFO: 0, MGO: 60 }, startOnline: ["DG1"],
    budget: 12, comfortTarget: 90, lateToleranceMin: 45,
    gateStart: false, maxConcurrent: 1,
    route: [
      { fromPort: "Bergen", toPort: "Flåm", distanceNm: 85, orderKn: 13, dwellMin: 90, weather: "calm", drift: { min: 60, label: "fjord wall to leeward" } },
      { fromPort: "Flåm", toPort: "Bergen", distanceNm: 85, orderKn: 13, dwellMin: 60, weather: "calm", deadlineMin: 1100, drift: { min: 60, label: "fjord wall to leeward" } },
    ],
    jobs: [],
    objectives: [
      { id: "o1", text: "Start DG2 and close its breaker (tap the DG tile)", check: "dgOnline", n: 2 },
      { id: "o2", text: "Bring DG3 online too — hold N+1 reserve for departure", check: "dgOnline", n: 3, opensGate: true },
      { id: "o3", text: "Answer the bridge telegraph", check: "telegraphAcked" },
      { id: "o4", text: "Get us underway at 13 knots", check: "underway" },
      { id: "o5", text: "Acknowledge every alarm on the annunciator", check: "ackAll" },
      { id: "o6", text: "Bring her home — complete the round trip", check: "arrived", n: 2 },
    ],
    script: [
      { atTick: 1, mentor: "Welcome aboard, Chief. I'm Maren Voss, Staff Chief — I'll ride with you the first few ships. This panel is the whole plant: generators on top, the bus bar, and everything the hotel and propellers drink from it. DG1 is carrying the harbour load alone. Start DG2: tap its tile, press START, and when it's up to speed, CLOSE the breaker." },
      { whenObjective: "o1", mentor: "Good. Two online. Now look at the RESERVE readout: if the biggest machine tripped right now, could the rest carry the ship? That margin is called spinning reserve — the first number a chief reads. Bring DG3 on as well before we sail." },
      { whenObjective: "o2", mentor: "N+1 held. The bridge will ring the telegraph — answer it and match the speed. You can PAUSE any time (spacebar) — a paused plant is a thinking chief, not a slow one." },
      { atLeg: 0, atNm: 25, event: "seachest", componentId: "DG1", mentor: "First squawk of the day — sea water pressure low on DG1. The fjord is full of jellyfish this time of year and they end up in the sea chest strainers. Tap the alarm tile to acknowledge it, then open DG1 and change over the sea suction. Take your time: PAUSE the clock if you want to read first." },
      { atLeg: 0, atNm: 60, mentor: "Alarm handled and logged — that's the rhythm of the job: the panel talks, you answer, the log remembers. Enjoy the view — Aurland fjord is doing its best today." },
      { atLeg: 1, atNm: 40, mentor: "On the way home, watch the fuel margin readout — burn against plan. Two engines at high load burn less than three loafing. With the fjord behind us, you can drop to two online if you accept the thinner reserve. Your call, Chief — that trade IS the job." },
    ],
    pool: [],
  },
  {
    id: "L2", name: "Baltic Overnight", ship: "baltica",
    startGrade: "MGO", startFuel: { HFO: 0, MGO: 25 }, startOnline: ["DG1", "DG2"],
    budget: 30, comfortTarget: 88, lateToleranceMin: 45,
    gateStart: false, maxConcurrent: 1,
    route: [
      { fromPort: "Stockholm", toPort: "Helsinki", distanceNm: 250, orderKn: 17, dwellMin: 240, weather: "moderate", deadlineMin: 1250, bunkerPrices: { HFO: 480, MGO: 700 }, drift: { min: 90, label: "archipelago rocks" } },
      { fromPort: "Helsinki", toPort: "Tallinn", distanceNm: 50, orderKn: 15, dwellMin: 180, weather: "calm", deadlineMin: 2000, drift: { min: 90, label: "Gulf of Finland shoals" } },
    ],
    jobs: [
      { id: "j-fw-pump", title: "Renew No.2 fire pump mechanical seal", kind: "service", durationMin: 120, partsCost: 2 },
      { id: "j-dg3-fltr", title: "DG3 fuel filter & injector check (condition 72%)", kind: "service", component: "DG3", conditionGain: 20, durationMin: 150, partsCost: 3 },
    ],
    objectives: [
      { id: "o1", text: "Bunker for the crossing — at least 70 t MGO aboard", check: "bunkered", tonnes: 70 },
      { id: "o2", text: "Blackout drill: recover the plant — start a DG, close its breaker, restore the hotel stages", check: "blackoutRecovered", opensGate: true },
      { id: "o3", text: "Work the ticket queue: get DG3's service done before departure", check: "jobDone", jobId: "j-dg3-fltr" },
      { id: "o4", text: "Answer the telegraph and make the schedule", check: "telegraphAcked" },
      { id: "o5", text: "Arrive Tallinn with the passengers still smiling", check: "arrived", n: 2 },
    ],
    script: [
      { atTick: 1, mentor: "The Baltica. Seven hundred berths, three engines, and a hotel that eats three megawatts before breakfast. Two things before we sail: fuel and the drill. Open FUEL and take bunkers — the whole Baltic is an emission control area, so she burns marine gas oil, nothing dirtier. Buy enough for the crossing with margin: the readout shows projected need." },
      { whenObjective: "o1", mentor: "Stems aboard and sampled. Now — the Captain's agreed to a blackout drill while we're fast alongside. I'm going to kill the plant. Watch the emergency generator pick up the essential bus, then bring us back: START a generator, CLOSE its breaker onto the dead board, then restore the shed hotel stages one at a time. This is the drill that saved the Viking Sky's people — learn it here, where the water's flat." },
      { whenObjective: "o1", drill: true },
      { whenObjective: "o2", mentor: "Textbook. Blackout recovery is a sequence, not a scramble: essential bus → first generator → dead board → loads in stages. You'll do it again someday with a lee shore in the window. Now clear that maintenance ticket on DG3 — she's the tired one of the three." },
      { atLeg: 0, atNm: 60, mentor: "Overnight leg. Hotel load falls after midnight — watch the bus and decide if you can drop to two engines. Fuel margin is the scoreboard; reserve is the insurance premium. Balance them and you're already a better chief than most." },
      { atLeg: 0, atNm: 150, event: "sewage-vacuum", mentor: "Vacuum's sagging somewhere below decks. Toilets on a cruise ship are not optional, Chief — sort it before the morning rush." },
      { atLeg: 1, atNm: 10, mentor: "Short hop to Tallinn. Bring her in clean." },
    ],
    pool: [
      { eventId: "boiler-flame", per: "system", componentId: null, perHour: 0.01 },
    ],
  },
  {
    id: "L3", name: "Mediterranean Rotation", ship: "meridian",
    startGrade: "HFO", startFuel: { HFO: 600, MGO: 140 }, startOnline: ["DG1", "DG3"],
    budget: 115, comfortTarget: 85, lateToleranceMin: 60,
    gateStart: true, maxConcurrent: 1,
    route: [
      { fromPort: "Barcelona", toPort: "Palma", distanceNm: 140, orderKn: 20, dwellMin: 300, weather: "calm", eca: true, deadlineMin: 820 },
      { fromPort: "Palma", toPort: "Civitavecchia", distanceNm: 260, orderKn: 20, dwellMin: 300, weather: "moderate", deadlineMin: 1900 },
      { fromPort: "Civitavecchia", toPort: "Napoli", distanceNm: 120, orderKn: 18, dwellMin: 0, weather: "calm", eca: true, deadlineMin: 3000 },
    ],
    jobs: [
      { id: "j-dg2-inj", title: "DG2 injector overhaul — 1,900 h overdue", kind: "service", component: "DG2", conditionGain: 25, durationMin: 240, partsCost: 6, critical: true, dueTick: 0 },
      { id: "j-pur-bowl", title: "Purifier bowl clean & O-rings", kind: "service", system: "purifier", durationMin: 120, partsCost: 2 },
      { id: "j-dg4-tc", title: "DG4 turbocharger wash", kind: "service", component: "DG4", conditionGain: 10, durationMin: 90, partsCost: 1 },
    ],
    objectives: [
      { id: "o1", text: "This ship burns heavy oil: keep the purifiers healthy (watch the fuel-quality meter)", check: "jobDone", jobId: "j-pur-bowl" },
      { id: "o2", text: "First ECA leg: complete the switchover to MGO before Palma approach", check: "switchoverDone", grade: "MGO", armsPool: true },
      { id: "o3", text: "Clear DG2's overdue injector job — overdue machinery fails", check: "jobDone", jobId: "j-dg2-inj" },
      { id: "o4", text: "Finish the rotation — three ports, on time, no fines", check: "arrived", n: 3 },
    ],
    script: [
      { atTick: 1, mentor: "The Meridian — a proper little liner, and your first heavy-fuel ship. HFO is cheap and filthy: it must be heated, spun clean in the purifiers, and it still carries catalyst grit that eats liners. The purifier is the machine that stands between that grit and your engines. Keep it sweet. Also: this run touches Emission Control Areas — inside them we burn MGO or we get fined. The switchover takes three-quarters of an hour — start it EARLY. And you have two repair teams now: the MAINT tab is your work list." },
      { atLeg: 0, atNm: 90, mentor: "Palma approach is an ECA stretch — if the switchover isn't running yet, start it NOW in FUEL. Log shows the boundary time; the sea doesn't wait for slow paperwork." },
      { atLeg: 1, atNm: 30, event: "purifier-fail", mentor: "There's the purifier grumbling. If that bowl stops spinning while we're on heavy oil, cat fines walk straight into the fuel pumps. Deal with it or pay in liners." },
      { atLeg: 1, atNm: 200, mentor: "Civitavecchia tomorrow. Check MAINT before you sleep: what's due, what's overdue, which team is free. A chief who plans port work sleeps at sea." },
      { atLeg: 2, atNm: 20, mentor: "Napoli leg is ECA again. You know the drill now — grade, boundary, forty-five minutes." },
    ],
    pool: [
      { eventId: "injector", per: "dg", perHour: 0.006, catFinesSensitive: true },
      { eventId: "seachest", per: "dg", perHour: 0.004 },
      { eventId: "boiler-flame", per: "system", componentId: null, perHour: 0.008 },
      { eventId: "evap-low", per: "system", componentId: null, perHour: 0.006 },
    ],
  },
  {
    id: "L4", name: "North Atlantic", ship: "atlantica",
    startGrade: "MGO", startFuel: { HFO: 1100, MGO: 260 }, startOnline: ["DG11", "DG21"],
    budget: 460, comfortTarget: 82, lateToleranceMin: 120,
    gateStart: true, maxConcurrent: 2,
    route: [
      { fromPort: "Southampton", toPort: "mid-Atlantic waypoint", distanceNm: 1500, orderKn: 21.5, dwellMin: 0, weather: "moderate", eca: true, deadlineMin: 4600, drift: { min: 120, label: "Scilly lee shore" } },
      { fromPort: "waypoint", toPort: "New York", distanceNm: 1500, orderKn: 21.5, dwellMin: 0, weather: "storm", eca: true, deadlineMin: 9400 },
    ],
    jobs: [
      { id: "j-lo-dg12", title: "Top up DG12 lube-oil sump (46%)", kind: "lo-topup", component: "DG12", durationMin: 60, partsCost: 1 },
      { id: "j-lo-dg21", title: "Top up DG21 lube-oil sump (44%)", kind: "lo-topup", component: "DG21", durationMin: 60, partsCost: 1 },
      { id: "j-dg22-def", title: "DG22 crankshaft deflections", kind: "service", component: "DG22", conditionGain: 5, durationMin: 180, partsCost: 1 },
      { id: "j-emgen", title: "Test emergency generator on load", kind: "emgen-test", durationMin: 45, partsCost: 0 },
    ],
    objectives: [
      { id: "o1", text: "Two engine rooms now: open and re-close the bus-tie so you know the geometry", check: "tieOpen" },
      { id: "o2", text: "Re-close the tie for the crossing", check: "tieClosed", armsPool: true },
      { id: "o3", text: "There's weather ahead: top up every low sump BEFORE the storm (Viking Sky, 2019)", check: "sumpsTopped" },
      { id: "o4", text: "ECA at both ends: scrubber on HFO, or MGO — never dirty fuel bare", check: "scrubberOn" },
      { id: "o5", text: "Cross. On schedule if you can; intact regardless", check: "arrived", n: 2 },
    ],
    script: [
      { atTick: 1, mentor: "The Atlantica, and the North Atlantic in a bad mood. Two engine rooms now — ER1 and ER2 — separate boards with a tie breaker between. Tie closed, it's one big bus; tie open, two islands: a fire in one room can't take both. Feel the geometry before the weather: open the tie, watch the boards island, close it again. She also has a scrubber — we can burn heavy oil inside the ECA while it runs. And check the sumps: two engines are low, and the forecast is filthy." },
      { atTick: 2, event: "lo-slosh-warn" },
      { atLeg: 0, atNm: 400, mentor: "You'll want the fins out and the engine room secured before the second half. SYS tab: stabilizers, and 'secure for heavy weather'. Nobody ever regretted lashing early." },
      { atLeg: 1, atNm: 100, weatherWarn: "Storm force 10 ahead, 9-metre seas. Reduce if you must — the schedule forgives more than the ocean does.", mentor: "Here it comes. Low sumps in heavy rolling lose suction — that's what blacked out the Viking Sky a cable from the rocks. If yours are topped, the machines will hold. Watch, acknowledge, keep the reserve fat." },
      { atLeg: 1, atNm: 700, event: "turbo", componentId: "DG21", mentor: "Turbocharger on DG21 is singing in the swell. Nurse it — derate now and overhaul in New York, or push and buy a rotor." },
      { atLeg: 1, atNm: 1300, mentor: "Nantucket ahead, ECA again. Grade or scrubber — your choice, but be compliant when we cross the line." },
    ],
    pool: [
      { eventId: "injector", per: "dg", perHour: 0.005, catFinesSensitive: true },
      { eventId: "seachest", per: "dg", perHour: 0.003 },
      { eventId: "stab-fault", per: "system", componentId: null, perHour: 0.01 },
      { eventId: "steering", per: "system", componentId: null, perHour: 0.004 },
      { eventId: "bilge-leak", per: "system", componentId: null, perHour: 0.005 },
    ],
  },
  {
    id: "L5", name: "Caribbean Loop", ship: "caribia",
    startGrade: "HFO", startFuel: { HFO: 900, MGO: 300 }, startOnline: ["DG51", "DG54"],
    budget: 400, comfortTarget: 80, lateToleranceMin: 120,
    gateStart: true, maxConcurrent: 3, tropical: true, climateFactor: 1.15,
    route: [
      { fromPort: "Miami", toPort: "Cozumel", distanceNm: 500, orderKn: 21, dwellMin: 360, weather: "calm", eca: true, deadlineMin: 1900, bunkerPrices: { HFO: 470, MGO: 750 } },
      { fromPort: "Cozumel", toPort: "George Town", distanceNm: 300, orderKn: 20, dwellMin: 360, weather: "moderate", deadlineMin: 3400, psc: true, bunkerPrices: { HFO: 430, MGO: 720 } },
      { fromPort: "George Town", toPort: "Ocho Rios", distanceNm: 250, orderKn: 19, dwellMin: 360, weather: "calm", deadlineMin: 4800 },
      { fromPort: "Ocho Rios", toPort: "Miami", distanceNm: 600, orderKn: 21, dwellMin: 0, weather: "moderate", eca: true, deadlineMin: 7000 },
    ],
    jobs: [
      { id: "j-emgen", title: "Test emergency generator on load (PSC will ask)", kind: "emgen-test", durationMin: 45, partsCost: 0, critical: true, dueTick: 3000 },
      { id: "j-dg52-svc", title: "DG52 cylinder head overhaul — overdue (64%)", kind: "service", component: "DG52", conditionGain: 30, durationMin: 420, partsCost: 12, critical: true, dueTick: 0 },
      { id: "j-chill-tube", title: "Chiller No.3 condenser tube clean", kind: "service", system: "chillers", durationMin: 180, partsCost: 3 },
      { id: "j-lo-all", title: "Round of LO top-ups, all engines", kind: "lo-topup", component: "DG53", durationMin: 90, partsCost: 2 },
    ],
    objectives: [
      { id: "o1", text: "4,200 passengers in the tropics: keep the chillers alive at any cost", check: "jobDone", jobId: "j-chill-tube" },
      { id: "o2", text: "Full bunker call at Cozumel: plan tonnes against the loop, mind the topping-off", check: "bunkered", tonnes: 1400, armsPool: true },
      { id: "o3", text: "Test the emergency generator before George Town — Port State Control boards there", check: "jobDone", jobId: "j-emgen" },
      { id: "o4", text: "Clear DG52's overdue head overhaul before it clears itself", check: "jobDone", jobId: "j-dg52-svc" },
      { id: "o5", text: "Close the loop to Miami", check: "arrived", n: 4 },
    ],
    script: [
      { atTick: 1, mentor: "The Caribia. Four thousand two hundred souls, thirty-two megawatts of sunshine load, and every one of those souls expects cold air, hot food, running water and a flushing toilet — simultaneously. The hotel plant is your front line now: chillers, evaporators, sewage. Also — Port State Control boards at George Town. They'll want the emergency generator tested, the work list clean, and the oil record straight. Give them nothing." },
      { atLeg: 0, atNm: 480, mentor: "Bunker barge booked at Cozumel. Plan the full loop plus twenty percent. Watch the topping-off rate — a deck full of heavy oil is a career-ending photograph." },
      { whenInPort: 1, event: "offspec-bunker", mentor: "Lab flash: the Cozumel stem is showing 78 milligrams of cat fines — over limit. Quarantine that tank until we argue with the supplier, or it goes through the plant like grinding paste." },
      { atLeg: 1, atNm: 150, event: "chiller-trip", mentor: "There goes a chiller, and it's 31 degrees on deck. Cabins will be ovens in two hours. Priorities, Chief." },
      { atLeg: 3, atNm: 80, event: "fuel-leak", componentId: "DG52", mentor: "FUEL LEAK ON DG52 — spray near the exhaust. This is how the Carnival Triumph burned: one flexible hose. Stop the engine, isolate, renew. Do NOT let it find the lagging." },
      { atLeg: 3, atNm: 400, mentor: "Home stretch, ECA off Florida. Compliant fuel, tidy plant, and a clean handover. That's a chief's arrival." },
    ],
    pool: [
      { eventId: "injector", per: "dg", perHour: 0.005, catFinesSensitive: true },
      { eventId: "seachest", per: "dg", perHour: 0.004 },
      { eventId: "chiller-trip", per: "system", componentId: null, perHour: 0.008 },
      { eventId: "sewage-vacuum", per: "system", componentId: null, perHour: 0.008 },
      { eventId: "evap-low", per: "system", componentId: null, perHour: 0.006 },
      { eventId: "scrubber-fault", per: "system", componentId: null, perHour: 0.006 },
      { eventId: "boiler-flame", per: "system", componentId: null, perHour: 0.006 },
    ],
  },
  {
    id: "L6", name: "The Crossing — MS Harmonia", ship: "harmonia",
    startGrade: "MGO", startFuel: { HFO: 2600, MGO: 500 }, startOnline: ["DG61", "DG64"],
    budget: 1250, comfortTarget: 78, lateToleranceMin: 180,
    gateStart: true, maxConcurrent: 3,
    route: [
      { fromPort: "Southampton", toPort: "Biscay waypoint", distanceNm: 600, orderKn: 22, dwellMin: 0, weather: "moderate", eca: true, deadlineMin: 2200, drift: { min: 90, label: "Ushant separation scheme" } },
      { fromPort: "Biscay", toPort: "mid-Atlantic waypoint", distanceNm: 1600, orderKn: 22, dwellMin: 0, weather: "storm", deadlineMin: 7200 },
      { fromPort: "mid-Atlantic", toPort: "Florida Strait", distanceNm: 1400, orderKn: 22, dwellMin: 0, weather: "moderate", deadlineMin: 12200 },
      { fromPort: "Florida Strait", toPort: "Fort Lauderdale", distanceNm: 300, orderKn: 18, dwellMin: 0, weather: "calm", eca: true, deadlineMin: 13000, psc: true, pscDetains: true, drift: { min: 120, label: "Florida reef line" } },
    ],
    jobs: [
      { id: "j-emgen", title: "Test emergency generator on load", kind: "emgen-test", durationMin: 45, partsCost: 0, critical: true, dueTick: 4000 },
      { id: "j-lo-dg63", title: "Top up DG63 sump (47%)", kind: "lo-topup", component: "DG63", durationMin: 60, partsCost: 1 },
      { id: "j-lo-dg64", title: "Top up DG64 sump (45%)", kind: "lo-topup", component: "DG64", durationMin: 60, partsCost: 1 },
      { id: "j-dg66-svc", title: "DG66 injector & liner check (70%)", kind: "service", component: "DG66", conditionGain: 22, durationMin: 300, partsCost: 8, critical: true, dueTick: 2000 },
      { id: "j-pur-svc", title: "Purifier No.2 major service", kind: "service", system: "purifier", durationMin: 240, partsCost: 5 },
    ],
    objectives: [
      { id: "o1", text: "Ninety-six megawatts, six machines, two rooms: build your lineup and hold N+1", check: "reserveHeld", n: 3 },
      { id: "o2", text: "Top up the low sumps and secure before Biscay — storm force ahead", check: "sumpsTopped", armsPool: true },
      { id: "o3", text: "Test the emergency generator early — Port State Control detains at Fort Lauderdale", check: "jobDone", jobId: "j-emgen" },
      { id: "o4", text: "Survive whatever the Atlantic sends. Keep them fed, cooled and moving", check: "arrived", n: 3 },
      { id: "o5", text: "Bring the largest cruise ship afloat alongside on schedule", check: "arrived", n: 4 },
    ],
    script: [
      { atTick: 1, mentor: "MS Harmonia. Ninety-six megawatts, three azipods, six thousand eight hundred passengers, and my last voyage before I retire — so don't scratch her. Everything you've learned is aboard: two rooms, the tie, the scrubber, heavy oil and gas oil, a hotel the size of a town. The Atlantic has a storm queued for Biscay and the glass is still falling. Sumps first, Chief. Always sumps first." },
      { atLeg: 1, atNm: 100, weatherWarn: "Storm force 10-11 through Biscay, 10-metre significant. Rogue sea reported by the Ondine 200 miles ahead.", mentor: "Fins out, secure the plant, fat reserve. If a big one hits us, machines that were healthy stay on the board; machines that were marginal go dark. You've read the Ondine's traffic — assume her wave is waiting for us." },
      { atLeg: 1, atNm: 800, event: "rogue-wave", componentId: "DG62", mentor: "HOLD ON—" },
      { atLeg: 1, atNm: 810, mentor: "…and that was a rogue sea. Count the plant, answer the alarms in severity order, and get the tripped machinery back. This is what the drills were for." },
      { atLeg: 2, atNm: 500, event: "er-fire-major", mentor: "FIRE IN ER2 — this is not a drill. Procedure, Chief, in order, no shortcuts: fuel, fans, dampers, MUSTER, then CO₂. We are 1,400 miles from land: whatever survives the next quarter hour is the plant that takes us home. Safe return to port — that's what the second engine room is FOR." },
      { atLeg: 2, atNm: 700, mentor: "Half a plant, a whole ship. Shed what the hotel can spare, keep the reserve honest on ER1, and mind the fuel curve — we lost the economical lineup with the fire." },
      { atLeg: 3, atNm: 50, mentor: "Florida ECA, then the berth — and PSC boards on arrival, and they detain for less. Emergency gen tested, records clean, work list defensible. Show them a chief's ship. It's been a pleasure, by the way. The watch is yours." },
    ],
    pool: [
      { eventId: "injector", per: "dg", perHour: 0.004, catFinesSensitive: true },
      { eventId: "seachest", per: "dg", perHour: 0.003 },
      { eventId: "turbo", per: "dg", perHour: 0.003 },
      { eventId: "oil-mist", per: "dg", perHour: 0.0012 },
      { eventId: "chiller-trip", per: "system", componentId: null, perHour: 0.007 },
      { eventId: "sewage-vacuum", per: "system", componentId: null, perHour: 0.007 },
      { eventId: "evap-low", per: "system", componentId: null, perHour: 0.005 },
      { eventId: "scrubber-fault", per: "system", componentId: null, perHour: 0.005 },
      { eventId: "stab-fault", per: "system", componentId: null, perHour: 0.008 },
      { eventId: "steering", per: "system", componentId: null, perHour: 0.003 },
      { eventId: "bilge-leak", per: "system", componentId: null, perHour: 0.004 },
      { eventId: "boiler-flame", per: "system", componentId: null, perHour: 0.005 },
    ],
  },
];

// ----------------------------------------------------------------- manual --

export const MANUAL = [
  { id: "power", title: "Power & the bus", body: [
    "A cruise ship is a floating power station: every generator feeds the main switchboard (the bus), and everything else — propulsion pods, air conditioning, galleys, lighting — is just an electrical consumer hanging off it.",
    "Demand = hotel load (the town) + propulsion (roughly speed cubed) + auxiliaries. If demand exceeds what the online generators can make, the bus overloads: first the automation sheds hotel stages, then the whole board trips — blackout.",
    "The mimic diagram is live: tap a generator to start, stop or work its breaker; tap the shed chips to drop or restore hotel stages." ] },
  { id: "generators", title: "Generators & lineup", body: [
    "Each diesel generator (DG) takes ~3 minutes to start and come up to speed ('ready'), then you close its breaker onto the board.",
    "Engines are most economical at 75–85% load. Too many online = each runs light and wastes fuel; too few = no margin. The art of the lineup is running the fewest machines that still leave you safe.",
    "Condition falls with running hours; overdue maintenance multiplies the failure risk. The MAINT tab shows what's due." ] },
  { id: "reserve", title: "Spinning reserve (N+1)", body: [
    "Spinning reserve = online capacity − demand − the largest online machine. Positive reserve means: if your biggest generator trips this second, the rest still carry the ship. That is 'N+1'.",
    "The RESERVE readout on the header is the first number a chief reads. Negative reserve is a bet that nothing fails today.",
    "During manoeuvring and storms, run fatter margins: thrusters and stabilizers arrive suddenly, and weather adds up to 30% to propulsion demand." ] },
  { id: "blackout", title: "Blackout recovery", body: [
    "Total loss of power: the emergency generator auto-starts within a minute and feeds only the essential bus (steering, lighting, controls, one fire and bilge pump). It will NOT move the ship.",
    "Recovery sequence: START a generator → CLOSE its breaker onto the dead board (this energizes it) → restore hotel shed stages one at a time → work back up to your lineup, largest consumers last.",
    "Fix the cause first: restarting into a fuel or cooling fault just trips you again. Adrift near a coast, a drift timer runs — the Viking Sky came within one ship-length of the rocks." ] },
  { id: "fuel", title: "Fuel & bunkering", body: [
    "HFO (heavy fuel oil) is cheap but dirty: it needs heating and purification, and carries abrasive cat fines. MGO (marine gas oil) is clean and roughly 60% dearer.",
    "Burn per generator = load × specific consumption (the SFOC curve — best near 80% load). The FUEL MARGIN readout projects tonnes remaining at destination: keep it positive.",
    "Bunkering happens in port: plan tonnes per grade against the voyage plus ~20% margin. Topping off a tank past 90% at full rate risks an overflow — a spill, a fine, and a photograph you don't want." ] },
  { id: "purifiers", title: "Purifiers & cat fines", body: [
    "Bunker HFO may contain up to 60 mg/kg of aluminium-silicon catalyst grit; engines want under 15 at the inlet. Centrifugal purifiers spin the grit out — while they run.",
    "If the purifier fails while you burn HFO, the fuel-quality meter climbs. Above ~70, liner and fuel-pump wear accelerates sharply on every HFO engine. It is silent damage: nothing breaks today, everything wears out this month.",
    "Purifier down? Fix it fast, or switch the plant to MGO and take the cost." ] },
  { id: "eca", title: "ECAs & the switchover", body: [
    "Emission Control Areas (Baltic, North Sea, both American coasts, the Med) demand 0.1% sulphur: burn MGO, or run HFO through a working scrubber.",
    "The switchover takes ~45 minutes — the system must cool gradually or fuel pumps seize. Start it BEFORE the boundary: the route strip shows ECA zones ahead.",
    "Compliance is arithmetic, not luck: every non-compliant hour inside a zone is logged and fined at the next port. Scrubber faults inside a zone force an immediate switchover." ] },
  { id: "maintenance", title: "Maintenance & the PMS", body: [
    "Every machine carries running hours against service intervals: filters daily, injectors ~2,000 h, turbochargers ~12,000 h, major overhauls ~24,000 h. The MAINT tab is your planned-maintenance list.",
    "Jobs need a free repair team and time; some need the ship alongside. Overdue critical jobs multiply failure risk and Port State Control counts them as deficiencies.",
    "Deferring maintenance is borrowing reliability from tomorrow — the debrief will show you the interest rate." ] },
  { id: "alarms", title: "Alarms & the annunciator", body: [
    "The tile grid is the annunciator: dark = normal, flashing = new alarm, steady = acknowledged and still active. ACK silences the flash — it does not fix the fault.",
    "Amber = abnormal, act soon. Red = act now. New alarms drop time compression to 1× automatically; the pause key is always your friend — orders can be given while paused.",
    "Every alarm links to its manual page — tap '?' on the tile." ] },
  { id: "hotel", title: "Hotel systems", body: [
    "The hotel is half your demand and all of your reputation: chillers (largest single consumer — in the tropics, cabins cook within hours of losing them), evaporators and RO plants making 250 litres per passenger-day, vacuum sewage (when it stops, the whole ship knows in minutes), boilers heating HFO tanks and laundry.",
    "Hotel shed stages exist for emergencies: stage 1 galley/laundry, stage 2 partial HVAC, stage 3 everything non-essential. Passengers notice stage 2. They write reviews about stage 3.",
    "Comfort recovers slowly; keep outages short." ] },
  { id: "weather", title: "Heavy weather", body: [
    "Rough seas add 10–30% to propulsion demand, drain comfort, and roll the ship. Fin stabilizers cut roll dramatically — but only above ~8 knots.",
    "Before a storm: top up low lube-oil sumps (below ~50%, heavy rolling exposes the suction and trips the engine on low pressure — the Viking Sky lesson), put the fins out, and 'secure for heavy weather'.",
    "You can ask the bridge to slow down. The schedule suffers; the machinery doesn't. Rogue waves exist: a prepared plant shrugs, an unprepared one goes dark." ] },
  { id: "fire", title: "Fire in the engine room", body: [
    "The procedure is a sequence, and the order is the point: (1) quick-closing fuel valves & stop purifiers, (2) stop ventilation, (3) close dampers, (4) EVACUATE and muster — headcount, (5) only then release CO₂, (6) boundary cooling, and keep the space shut for hours.",
    "CO₂ into a manned space kills. The game will refuse — real panels have interlocks and dead colleagues behind that rule.",
    "Even a fire you beat can cost the ship: cable runs above the fire feed both boards. Speed of response decides whether you lose a generator, a switchboard, or the plant. (Carnival Splendor and Triumph both lost everything to cable damage after 'small' fires.)" ] },
  { id: "flooding", title: "Flooding & the bilge", body: [
    "Bilge well alarms are the ship telling you she's taking water: find it, isolate it, pump it. Two bilge pumps first, direct injection (main seawater pump on the bilge) for serious ingress.",
    "Water over the plates reaches motors and switchboards long before it threatens buoyancy — electrical death comes first.",
    "Watertight doors and honest reporting to the bridge: list and trim are their problem, keeping the pumps ahead is yours." ] },
  { id: "bunkering", title: "Bunker quality & sampling", body: [
    "Every stem is sampled at the manifold, sealed, and sent ashore. Until the lab clears it, the new fuel stays quarantined in its own tank — a bad stem burned is liners destroyed.",
    "Off-spec results (sulphur, cat fines, water) mean: quarantine the tank, burn the old stem, fight the supplier with the sealed sample as evidence.",
    "The paperwork matters: Port State Control reads the oil record book like scripture, and detention costs a day and a headline." ] },
  { id: "emergencies", title: "Odd emergencies", body: [
    "Oil mist alarm: STOP the engine immediately and stay clear of the crankcase doors for 30 minutes. Oil mist is a crankcase explosion counting down in seconds.",
    "Steering pump failure: the standby pump takes seconds to start — do it before the bridge finishes drawing breath.",
    "Boiler flame failure: purge before every re-fire. Re-igniting into an unpurged furnace is how furnaces become shrapnel.",
    "Port State Control: they check the emergency generator was tested, the critical work list is clean, ECA hours are compliant, fuel treatment works. Three deficiencies can detain the ship." ] },
];
