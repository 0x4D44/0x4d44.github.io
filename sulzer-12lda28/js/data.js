// Engine data for the Sulzer 12LDA28 explorer.
// Every figure carries a confidence tag:
//   H  = stated by two or more independent sources
//   M  = one good technical source
//   L  = weak / forum / recollection
//   E  = ESTIMATE derived here by arithmetic or engineering practice (no source)
// The site shows these tags so nothing estimated passes as measured.

export const CONF = {
  H: { label: "Well sourced", css: "h" },
  M: { label: "Single source", css: "m" },
  L: { label: "Weak source", css: "l" },
  E: { label: "Estimate", css: "e" },
};

export const VARIANTS = {
  A: {
    id: "A", name: "12LDA28-A", rpm: 750, bhp: 2300, intercooled: false,
    use: "BR Class 44 'Peaks' (D1-D10) and test engines",
    note: "Not intercooled. Quoted as 2,300 bhp (one archive says 2,200).",
    conf: "M",
  },
  B: {
    id: "B", name: "12LDA28-B", rpm: 750, bhp: 2500, intercooled: true,
    use: "BR Class 45 and 46 'Peaks'",
    note: "Charge-air cooled (air-to-water intercooler) for 2,500 bhp at 750 rpm.",
    conf: "H",
  },
  C: {
    id: "C", name: "12LDA28-C", rpm: 800, bhp: 2750, intercooled: true,
    use: "BR Class 47 'Brush Type 4' (as built)",
    note: "2,750 bhp at 800 rpm as built; derated in the mid-1960s to 2,580 bhp at 750 rpm.",
    conf: "H",
  },
  Cd: {
    id: "Cd", name: "12LDA28-C (derated)", rpm: 750, bhp: 2580, intercooled: true,
    use: "BR Class 47 in service from c.1965",
    note: "Same torque and mean effective pressure as the 800 rpm rating: a pure speed cut.",
    conf: "H",
  },
};

export const SPEC = [
  ["Layout", "BR manual: \"double bank, in line, pressure charged, intercooled, four-stroke\". 12 cylinders as two 6-cylinder inline banks (twin-bank). Each bank has its own crankshaft; the two crankshafts are geared to a central generator shaft.", "H"],
  ["Cycle", "4-stroke, direct (solid) injection, exhaust-gas turbocharged", "H"],
  ["Bore x stroke", "280 mm x 360 mm", "H"],
  ["Swept volume", "22.2 litres per cylinder, 266 litres total", "E"],
  ["Rated speed", "750 rpm (800 rpm for the as-built Class 47 rating)", "H"],
  ["Power", "2,300 bhp (A); 2,500 bhp (B); 2,750 bhp at 800 rpm as built, then 2,580 bhp (1,920 kW; BR manual rounds to 2,600 hp) at 750 rpm (C)", "H"],
  ["Mean effective pressure", "about 11.6 bar at 2,580 bhp / 750 rpm", "E"],
  ["Mean piston speed", "9.0 m/s at 750 rpm (9.6 m/s at 800)", "E"],
  ["Firing frequency", "75 firings per second at 750 rpm (6 per revolution for the whole engine, 3 per bank; derived)", "E"],
  ["Crank to generator gearing", "about 1 : 1.44 (generator about 1,080 rpm at 750 engine rpm; a 1,150 rpm rating matches the 800 rpm as-built Class 47)", "M"],
  ["Structure", "Welded steel-plate crankcase with welded-in cast-steel transverse girders; main bearings held by adjustable wedges", "M"],
  ["Turbocharging", "Exhaust-gas turbocharger by de Havilland (Sulzer-designed, blade-shedding trouble cured with wire damping); charge air 16-18 psi (about 2.1 bar abs) at full power; air-to-water intercooler on B and C.", "M"],
  ["Governor", "Vickers Hydraulics, to a Sulzer design: flyweights driven from the camshaft; overspeed trip on the other end of the camshaft", "M"],
  ["Crankshafts", "Two, by Mitchell Shackleton, 7 main bearings each (Glacier bearings), joined by synchronising gears", "M"],
  ["Pistons and liners", "Two-piece oil-cooled pistons with both scraper rings below the gudgeon pin; centrifugally cast Sheepbridge liners", "M"],
  ["Cylinder heads", "Separate head per cylinder, two valves each (one inlet, one exhaust); austenitic-steel exhaust valves", "M"],
  ["Speed range", "325 to 750 rpm: idle 325/365 rpm (the manual gives both without saying when each applies), full power 750 rpm; progressive all-speed governor (BR driver's manual B.R.33003/262)", "H"],
  ["Derating logic", "Cutting speed from 800 to 750 rpm reduced stress by about 11%; crankshaft phase angles and balance weights were also altered after welded-crankcase fractures (derbysulzers, citing 1960s papers)", "M"],
  ["Fluids (Class 45/46)", "Cooling water 346 gal, lube oil 200 gal at 50 psi full power, fuel 840 gal; auxiliaries 95 bhp", "H"],
  ["Dry mass", "40,000 lb (18.1 t) including generator and gears, per a period table (probably an early rating)", "M"],
  ["Builder", "Sulzer Brothers, Winterthur; built under licence by Vickers-Armstrongs, Barrow-in-Furness", "H"],
  ["Compression ratio", "about 12 : 1 to 13 : 1 (typical of the class; not found in a source)", "E"],
  ["Peak firing pressure", "about 100 to 120 bar (not found in a source)", "E"],
  ["Firing order", "1-5-3-6-2-4 per bank assumed, banks interleaved 60 degrees apart. Real order not found.", "E"],
];

// Cycle angle alpha (crank degrees from firing TDC, 0..720).
// Power 0-180, exhaust 180-360, intake 360-540, compression 540-720.
// Timing figures are ESTIMATES from the practice of the period.
export const TIMING = {
  exhOpen: 130,    // 50 deg before BDC
  exhClose: 410,   // 50 deg after TDC
  inOpen: 300,     // 60 deg before TDC
  inClose: 580,    // 40 deg after BDC
  injStart: 698,   // 22 deg before TDC
  injDur: 26,
  conf: "E",
  note: "Valve and injection timing were not published in any source we could reach. These angles are typical of a 1960s medium-speed pressure-charged 4-stroke and are shown as estimates.",
};

// Geometry in millimetres.
export const GEOM = {
  bore: 280, stroke: 360, rod: 720, cylinders: 6, pitch: 500, bankSpacing: 640,
  rated: 750,
};

// Controller (throttle) -> engine speed and power.
// Sulzer locomotives have an all-speed governor, so power rises smoothly with
// controller position. Idle is 325/365 rpm per the Class 47 manual.
// Shape: P = Prated * (n/nrated)^1.6 on the load line (ESTIMATE).
export const IDLE_RPM = 390; // BR 33003/262 gives "325/365 r.p.m."; 8 Class 47 recordings idle at 385-394 (measured from audio), so 390 is used
export function rpmFromThrottle(t, variantRpm = 750) {
  // t: 0..1
  return IDLE_RPM + (variantRpm - IDLE_RPM) * Math.min(1, Math.max(0, t));
}
// Idle shows auxiliaries only: BR service data gives about 95 bhp for the Class 45 (assumed for the others; estimate).
export const AUX_BHP = 95;
export function engineBhp(rpm, variant) {
  const v = VARIANTS[variant] || VARIANTS.Cd;
  if (rpm <= IDLE_RPM + 5) return AUX_BHP;
  const f = Math.pow(rpm / v.rpm, 1.6);
  const p = v.bhp * f, k = Math.min(1, (rpm - IDLE_RPM) / 90); // eased up from the idle load (modelled)
  return Math.max(AUX_BHP, AUX_BHP + (p - AUX_BHP) * k);
}
export function torqueNm(rpm, bhp) {
  if (rpm < 1) return 0;
  return (bhp * 745.7) / (2 * Math.PI * rpm / 60);
}
export function bmepBar(rpm, bhp) {
  // 2*P / (Vs * n) for a 4-stroke
  const Vs = 0.2660; // m3
  const P = bhp * 745.7;
  return (2 * P) / (Vs * (rpm / 60)) / 1e5;
}

// Locomotive (Class 47 figures; mostly sourced; railFraction is an estimate).
export const CONTROLLER = ["OFF", "ON", "1/4", "1/2", "3/4", "FULL"]; // BR 33003/262: only ON and 1/4 are notched
export const LOCO = {
  genRatedKw: 1798, motorHp: 354, motors: 6, gearRatio: 66 / 17, wheelM: 1.143,
  railFraction: 0.785, maxSpeedMph: 95, maxTeLbf: 62000, maxTeMph: 10.5, contSpeedMph: 26, contTeLbf: 30000,
  weightT: 114, // BR manual: 114 tons approx; Wikipedia 112-120 t by variant
};

// TE (lbf) vs speed (mph) at full power: tractive hyperbola with adhesion cap.
export function teAtFullPower(mph, railHp) {
  const cap = LOCO.maxTeLbf;
  if (mph < 0.5) return cap;
  return Math.min(cap, (375 * railHp) / mph);
}

export const NOTES = [
  "Primary sources found: the BR driver's manuals B.R.33003/262 (Class 47, Feb 1969) and B.R.33003/246 (Class 45, Dec 1968), both scanned on archive.org.",
  "Honest data note: the primary Sulzer and BR manuals are not online. Wherever a figure is marked Estimate it was derived here, not read from a document.",
  "The BR manual confirms 62,000 lbf maximum up to 10.5 mph and 30,000 lbf continuous at 26 mph for the Class 47.",
];
