/* ============================================================================
 * The Peopling of the Earth — population model (data + math, no DOM)
 *
 * Environment-agnostic: usable in the browser (attaches to window.POP) and in
 * Node (module.exports), so the same maths the page renders can be unit- and
 * image-tested headlessly.
 *
 * The model is deliberately a *model*, not a dataset: global totals and the
 * macro-regional shares are anchored to published estimates (HYDE 3.2,
 * McEvedy & Jones, Maddison, UN WPP 2024); those aggregates are then spread
 * across fixed geographic "settlement nodes" and overlaid with the rise and
 * fall of history's great cities. Pre-1 CE and post-2100 figures are estimates
 * and projections respectively; post-2200 is openly speculative.
 * ========================================================================== */
(function (root, factory) {
  const M = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = M;
  else root.POP = M;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // ---- Global population at anchor years (millions) -----------------------
  // Negative years are BCE. Central estimates; sources broadly agree on the
  // shape if not the exact figures, especially before 1 CE.
  const WORLD_TOTALS = [
    [-10000, 5], [-8000, 8], [-5000, 15], [-3000, 30], [-2000, 50],
    [-1000, 80], [-500, 130], [-200, 190], [1, 230], [200, 225],
    [500, 210], [800, 240], [1000, 295], [1100, 320], [1200, 390],
    [1300, 400], [1340, 440], [1400, 375], [1500, 460], [1600, 545],
    [1650, 550], [1700, 610], [1750, 770], [1800, 950], [1850, 1260],
    [1900, 1650], [1920, 1860], [1940, 2300], [1950, 2493], [1960, 3030],
    [1970, 3695], [1980, 4458], [1990, 5327], [2000, 6171], [2010, 6986],
    [2020, 7851], [2025, 8232],
  ];

  // ---- Future projections (millions) --------------------------------------
  // 2030–2100: UN WPP 2024 medium variant. Peak ~10.3 bn around 2084.
  // Beyond 2100: a single defensible "stabilise then gentle decline" scenario.
  const PROJECTIONS = [
    [2030, 8546], [2040, 9159], [2050, 9644], [2060, 10056],
    [2070, 10271], [2084, 10290], [2100, 10187],
    [2150, 9400], [2200, 8200], [2300, 7500], [2500, 8000], [3025, 9000],
  ];
  const PEAK = { year: 2084, pop: 10290 };

  // ---- Macro-regional share of world population (%) at anchor years -------
  // Each row sums to ~100. Captures the great shifts: East/South Asia dominant
  // for millennia, Europe's early-modern rise, the Americas' pre-Columbian
  // weight and post-1500 collapse, and Africa's coming share.
  const REGIONS = [
    "East Asia", "South Asia", "Southeast Asia", "Central Asia",
    "Middle East & North Africa", "Sub-Saharan Africa", "Europe",
    "Russia & North Asia", "North America", "Latin America", "Oceania",
  ];
  // columns follow REGIONS order
  const SHARE_YEARS = [-2000, 1, 1000, 1500, 1700, 1900, 1950, 2000, 2025, 2100];
  const SHARES = {
    "-2000": [22, 26, 6, 3, 20, 9, 9, 1, 1, 3, 0.3],
    "1":     [26, 30, 5, 2, 12, 6, 13, 1, 1, 3, 0.3],
    "1000":  [22, 28, 6, 2, 10, 11, 13, 2, 1, 4, 0.3],
    "1500":  [24, 26, 5, 2, 7, 11, 16, 2, 1, 5, 0.4],
    "1700":  [27, 25, 5, 1.5, 6, 11, 18, 2.5, 0.3, 2, 0.3],
    "1900":  [26, 20, 5, 1, 4, 7, 25, 5, 5, 4.5, 0.4],
    "1950":  [27, 20, 7, 1, 4, 7, 22, 4, 7, 7, 0.5],
    "2000":  [24, 23, 8.5, 1, 6, 11, 12, 3, 5, 8.5, 0.5],
    "2025":  [20, 25, 8.5, 1.2, 7, 15, 9, 2.5, 4.5, 8, 0.6],
    "2100":  [11, 22, 7, 1.2, 8, 33, 5.5, 1.8, 4.5, 6, 0.7],
  };

  // ---- Settlement nodes: where, within a region, people actually live -----
  // Static within-region weights; the regional total (above) is split across
  // them. Lat/lon are representative population centres of gravity.
  // [name, lat, lon, weight]
  const NODES = {
    "East Asia": [
      ["North China Plain", 35.0, 114.5, 1.0], ["Lower Yangtze", 31.2, 120.6, 0.95],
      ["Sichuan Basin", 30.6, 104.1, 0.6], ["Pearl River Delta", 23.1, 113.3, 0.7],
      ["Middle Yangtze", 30.6, 114.3, 0.5], ["Beijing–Tianjin", 39.5, 116.8, 0.5],
      ["Korea", 37.0, 127.5, 0.55], ["Kanto (Tokyo)", 35.7, 139.7, 0.75],
      ["Kansai (Osaka)", 34.7, 135.5, 0.4], ["Manchuria", 42.0, 124.0, 0.35],
    ],
    "South Asia": [
      ["Upper Ganges", 26.8, 80.9, 1.0], ["Bengal", 23.5, 89.0, 0.95],
      ["Indus / Punjab", 30.5, 73.5, 0.7], ["Deccan", 17.8, 78.0, 0.55],
      ["South India", 12.5, 78.5, 0.6], ["West India", 20.5, 73.5, 0.6],
      ["Delhi", 28.6, 77.2, 0.45], ["Sri Lanka", 7.5, 80.7, 0.25],
    ],
    "Southeast Asia": [
      ["Java", -6.5, 107.5, 1.0], ["Red River (Hanoi)", 21.0, 105.8, 0.5],
      ["Mekong", 11.0, 106.0, 0.45], ["Chao Phraya (Bangkok)", 14.5, 100.6, 0.45],
      ["Luzon (Manila)", 14.8, 121.0, 0.5], ["Irrawaddy", 18.0, 96.0, 0.35],
      ["Sumatra / Malaya", 2.5, 101.5, 0.35],
    ],
    "Central Asia": [
      ["Transoxiana", 39.6, 66.9, 0.45], ["Khorasan / Afghanistan", 34.5, 65.0, 0.35],
      ["Tarim / Xinjiang", 39.5, 80.0, 0.2], ["Kazakh Steppe", 47.0, 68.0, 0.2],
    ],
    "Middle East & North Africa": [
      ["Lower Nile (Cairo)", 30.2, 31.2, 1.0], ["Mesopotamia", 33.0, 44.4, 0.8],
      ["Levant", 33.5, 36.0, 0.5], ["Anatolia", 39.5, 33.0, 0.6],
      ["Iranian Plateau", 33.5, 51.5, 0.6], ["Maghreb", 34.5, 4.0, 0.45],
      ["Arabia", 23.0, 45.0, 0.35], ["Upper Nile / Sudan", 15.5, 32.5, 0.3],
    ],
    "Sub-Saharan Africa": [
      ["West Africa (Niger delta)", 7.0, 5.0, 1.0], ["Sahel", 12.5, 4.0, 0.4],
      ["Ethiopian Highlands", 9.0, 38.7, 0.6], ["Great Lakes", -1.5, 33.0, 0.55],
      ["Congo Basin", -4.0, 18.0, 0.5], ["Southern Africa", -26.0, 28.0, 0.4],
      ["Gulf of Guinea coast", 5.5, 0.0, 0.5],
    ],
    "Europe": [
      ["Paris Basin", 48.9, 2.3, 0.7], ["Britain", 52.5, -1.5, 0.65],
      ["Rhine / Low Countries", 51.0, 6.5, 0.65], ["Po / Italy", 43.5, 11.5, 0.7],
      ["Iberia", 40.0, -3.7, 0.55], ["Germany", 51.0, 10.5, 0.6],
      ["Vistula / Poland", 52.0, 20.0, 0.4], ["Danube / Balkans", 44.5, 21.0, 0.4],
      ["Ukraine", 50.0, 31.0, 0.4], ["Scandinavia", 59.0, 16.0, 0.25],
    ],
    "Russia & North Asia": [
      ["Moscow", 55.7, 37.6, 0.7], ["Volga", 53.5, 49.0, 0.4],
      ["St Petersburg", 59.9, 30.3, 0.3], ["Siberia", 55.0, 83.0, 0.25],
    ],
    "North America": [
      ["US Northeast", 40.5, -75.5, 1.0], ["Great Lakes", 42.0, -85.0, 0.6],
      ["US South", 33.0, -88.0, 0.6], ["California", 35.0, -119.0, 0.7],
      ["Texas", 31.0, -97.0, 0.45], ["Canada (St Lawrence)", 44.5, -79.0, 0.4],
    ],
    "Latin America": [
      ["Valley of Mexico", 19.4, -99.1, 0.9], ["Central America / Maya", 15.5, -90.0, 0.4],
      ["Andes", -12.0, -76.0, 0.7], ["Brazil Southeast", -23.0, -46.0, 1.0],
      ["Brazil Northeast", -9.0, -38.0, 0.45], ["Río de la Plata", -34.6, -58.4, 0.5],
      ["Caribbean", 18.5, -71.0, 0.35], ["Colombia / Venezuela", 6.0, -73.0, 0.5],
    ],
    "Oceania": [
      ["Southeast Australia", -34.0, 149.0, 1.0], ["New Zealand", -41.0, 174.0, 0.3],
      ["New Guinea", -6.0, 145.0, 0.35],
    ],
  };

  // ---- Great cities: local intensity overlaid on the regional spread ------
  // Each glows from `from`, peaks (in thousands) at `peak`, fades by `to`.
  // This is what makes the "largest city in the world" wander the map.
  // [name, lat, lon, peakThousands, peakYear, fromYear, toYear]
  const CITIES = [
    ["Uruk", 31.32, 45.64, 60, -2900, -4000, -1500],
    ["Memphis", 29.84, 31.25, 80, -2250, -3100, -1000],
    ["Babylon", 32.54, 44.42, 200, -550, -1900, 300],
    ["Nineveh", 36.36, 43.15, 120, -680, -800, -600],
    ["Alexandria", 31.20, 29.92, 500, -100, -331, 500],
    ["Pataliputra", 25.61, 85.14, 300, -300, -490, 600],
    ["Rome", 41.89, 12.49, 1000, 100, -300, 500],
    ["Ctesiphon", 33.09, 44.58, 400, 570, 100, 750],
    ["Constantinople", 41.01, 28.98, 500, 550, 330, 1450],
    ["Chang'an", 34.27, 108.93, 1000, 750, -100, 904],
    ["Baghdad", 33.31, 44.36, 1000, 925, 762, 1258],
    ["Córdoba", 37.89, -4.78, 450, 1000, 800, 1150],
    ["Kaifeng", 34.80, 114.31, 700, 1120, 960, 1200],
    ["Hangzhou", 30.27, 120.16, 1000, 1265, 1150, 1400],
    ["Cairo", 30.04, 31.24, 500, 1340, 1000, 1520],
    ["Vijayanagara", 15.34, 76.46, 450, 1500, 1370, 1565],
    ["Tenochtitlan", 19.43, -99.13, 200, 1500, 1350, 1521],
    ["Nanjing", 32.06, 118.80, 700, 1400, 1360, 1450],
    ["Beijing", 39.90, 116.41, 1100, 1750, 1420, 1900],
    ["Istanbul", 41.01, 28.98, 700, 1600, 1450, 1750],
    ["Edo", 35.68, 139.69, 1100, 1720, 1600, 1850],
    ["London", 51.51, -0.13, 6500, 1900, 1750, 2000],
    ["Paris", 48.86, 2.35, 2700, 1900, 1700, 2000],
    ["New York", 40.71, -74.01, 12300, 1950, 1820, 2100],
    ["Tokyo", 35.68, 139.69, 37700, 2015, 1900, 2110],
    ["Delhi", 28.61, 77.21, 34700, 2032, 1900, 2120],
    ["Shanghai", 31.23, 121.47, 30500, 2025, 1920, 2110],
    ["Mumbai", 19.08, 72.88, 22100, 2025, 1850, 2110],
    ["Mexico City", 19.43, -99.13, 22500, 2010, 1700, 2110],
    ["São Paulo", -23.55, -46.63, 22800, 2025, 1900, 2110],
    ["Dhaka", 23.81, 90.41, 28000, 2050, 1950, 2120],
    ["Karachi", 24.86, 67.01, 20000, 2040, 1900, 2120],
    ["Cairo (modern)", 30.04, 31.24, 22600, 2040, 1900, 2120],
    ["Manila", 14.60, 120.98, 15000, 2030, 1571, 2110],
    ["Lagos", 6.52, 3.38, 33000, 2080, 1950, 2130],
    ["Kinshasa", -4.32, 15.31, 35000, 2090, 1960, 2130],
    ["Dar es Salaam", -6.79, 39.21, 25000, 2100, 2000, 2140],
    ["Sahel belt (Niamey)", 13.5, 5.0, 18000, 2120, 2020, 2150],
  ];

  // ---- Eras (for the changing caption) ------------------------------------
  const ERAS = [
    [-10000, "The Neolithic — first farmers"],
    [-3000, "The Bronze Age — first cities"],
    [-800, "Classical antiquity"],
    [200, "The age of empires"],
    [650, "The early medieval world"],
    [1000, "The high Middle Ages"],
    [1340, "The Black Death"],
    [1500, "The age of sail & exchange"],
    [1750, "The Industrial Revolution"],
    [1900, "The Great Acceleration"],
    [2025, "The present day"],
    [2085, "The projected peak"],
    [2101, "The long plateau (speculative)"],
    [2300, "The far future (speculative)"],
  ];

  // ---- Mortality events: the great checks on population -------------------
  // {year, label, kind, deaths (millions, central estimate, for marker size),
  //  toll (human-readable), region}. kind in disease | war | famine | mixed.
  const EVENTS = [
    { year: 165, label: "Antonine Plague", kind: "disease", deaths: 8, toll: "~5–10 million dead", region: "Europe" },
    { year: 541, label: "Plague of Justinian", kind: "disease", deaths: 25, toll: "~15–50 million dead", region: "Middle East & North Africa" },
    { year: 755, label: "An Lushan Rebellion", kind: "war", deaths: 13, toll: "tens of millions; the census fell by ~36 million", region: "East Asia" },
    { year: 1347, label: "The Black Death", kind: "disease", deaths: 50, toll: "~50 million dead — up to a third of Europe", region: "Europe" },
    { year: 1520, label: "American depopulation", kind: "disease", deaths: 55, toll: "50–90% of the Americas lost over a century", region: "Latin America" },
    { year: 1618, label: "Thirty Years' War", kind: "war", deaths: 7, toll: "~4–8 million dead", region: "Europe" },
    { year: 1918, label: "WWI & the 1918 flu", kind: "mixed", deaths: 45, toll: "~17M in the war + 25–50M from the flu", region: "Europe" },
    { year: 1939, label: "World War II", kind: "war", deaths: 75, toll: "~70–85 million dead", region: "Europe" },
    { year: 1959, label: "Great Chinese Famine", kind: "famine", deaths: 30, toll: "~15–45 million dead", region: "East Asia" },
  ];

  // ---- Timeline: normalised playhead t (0..1) -> year ---------------------
  // Non-linear so eventful recent eras get screen time and the deep past and
  // far future are compressed.
  const TIMELINE = [
    [0.0, -10000], [0.10, -3000], [0.20, -1000], [0.28, 1], [0.37, 1000],
    [0.45, 1400], [0.52, 1600], [0.60, 1800], [0.68, 1900], [0.76, 1970],
    [0.82, 2025], [0.90, 2100], [0.96, 2400], [1.0, 3025],
  ];

  // ---------------------------------------------------------------------------
  // Maths
  // ---------------------------------------------------------------------------
  function lerp(a, b, u) { return a + (b - a) * u; }

  // piecewise interpolation over [x,y] pairs; `logy` interpolates in log space
  function interpPairs(pairs, x, logy) {
    if (x <= pairs[0][0]) return pairs[0][1];
    const last = pairs[pairs.length - 1];
    if (x >= last[0]) return last[1];
    for (let i = 1; i < pairs.length; i++) {
      if (x <= pairs[i][0]) {
        const [x0, y0] = pairs[i - 1], [x1, y1] = pairs[i];
        const u = (x - x0) / (x1 - x0);
        if (logy) return Math.exp(lerp(Math.log(y0), Math.log(y1), u));
        return lerp(y0, y1, u);
      }
    }
    return last[1];
  }

  const ALL_TOTALS = WORLD_TOTALS.concat(PROJECTIONS);
  function worldTotalAt(year) { return interpPairs(ALL_TOTALS, year, true); }

  function yearFromT(t) {
    return Math.round(interpPairs(TIMELINE, Math.max(0, Math.min(1, t)), false));
  }
  function tFromYear(year) {
    // inverse of TIMELINE (monotonic in year)
    const tl = TIMELINE;
    if (year <= tl[0][1]) return 0;
    if (year >= tl[tl.length - 1][1]) return 1;
    for (let i = 1; i < tl.length; i++) {
      if (year <= tl[i][1]) {
        const [t0, y0] = tl[i - 1], [t1, y1] = tl[i];
        return lerp(t0, t1, (year - y0) / (y1 - y0));
      }
    }
    return 1;
  }

  function regionShareAt(region, year) {
    const idx = REGIONS.indexOf(region);
    const pairs = SHARE_YEARS.map((y) => [y, SHARES[String(y)][idx]]);
    return interpPairs(pairs, year, false);
  }

  // Population (millions) of a macro-region in a given year.
  function regionPopAt(region, year) {
    return worldTotalAt(year) * regionShareAt(region, year) / 100;
  }

  function eraLabel(year) {
    let label = ERAS[0][1];
    for (const [y, l] of ERAS) if (year >= y) label = l;
    return label;
  }

  // Returns array of {lat, lon, pop} where pop is millions for region spread,
  // plus city overlay weighted similarly (converted from thousands).
  function activeNodes(year) {
    const out = [];
    for (const region of REGIONS) {
      const total = worldTotalAt(year) * regionShareAt(region, year) / 100; // millions
      const nodes = NODES[region];
      let wsum = 0;
      for (const n of nodes) wsum += n[3];
      for (const [name, lat, lon, w] of nodes) {
        out.push({ name, lat, lon, pop: total * (w / wsum), region, kind: "region" });
      }
    }
    return out;
  }

  function activeCities(year) {
    const out = [];
    for (const [name, lat, lon, peakK, peakY, fromY, toY] of CITIES) {
      if (year < fromY || year > toY) continue;
      // triangular-ish envelope, eased, peaking at peakY
      let env;
      if (year <= peakY) env = (year - fromY) / Math.max(1, peakY - fromY);
      else env = (toY - year) / Math.max(1, toY - peakY);
      env = Math.max(0, env);
      env = env * env * (3 - 2 * env); // smoothstep
      const pop = (peakK / 1000) * env; // millions-equivalent
      if (pop <= 0.0001) continue;
      out.push({ name, lat, lon, pop, kind: "city" });
    }
    return out;
  }

  // ---------------------------------------------------------------------------
  // Density grid
  // ---------------------------------------------------------------------------
  // Splats Gaussian footprints of every node/city into a [gridW x gridH]
  // Float32 field. Longitude wraps; latitude clamps. Amplitudes are in
  // "millions"; `colorize` maps the field to colour with a fixed reference so
  // growth over time is felt as the map lighting up.
  // Footprint sizes in *degrees* so the field is resolution-independent.
  const REGION_SIGMA_DEG = 3.6; // ~400 km
  const CITY_SIGMA_DEG = 1.7;

  function splat(field, gridW, gridH, lat, lon, amp, sigma) {
    const gx = ((lon + 180) / 360) * gridW;
    const gy = ((90 - lat) / 180) * gridH;
    const r = Math.ceil(sigma * 3);
    const inv2s2 = 1 / (2 * sigma * sigma);
    const cx = Math.round(gx), cy = Math.round(gy);
    for (let dy = -r; dy <= r; dy++) {
      const y = cy + dy;
      if (y < 0 || y >= gridH) continue;
      for (let dx = -r; dx <= r; dx++) {
        let x = cx + dx;
        x = ((x % gridW) + gridW) % gridW; // wrap longitude
        const d2 = dx * dx + dy * dy;
        field[y * gridW + x] += amp * Math.exp(-d2 * inv2s2);
      }
    }
  }

  function computeDensity(year, gridW, gridH, field) {
    field = field || new Float32Array(gridW * gridH);
    field.fill(0);
    const cellsPerDeg = gridW / 360;
    const rSig = REGION_SIGMA_DEG * cellsPerDeg;
    const cSig = CITY_SIGMA_DEG * cellsPerDeg;
    const region = activeNodes(year);
    for (const n of region) splat(field, gridW, gridH, n.lat, n.lon, n.pop, rSig);
    const cities = activeCities(year);
    for (const c of cities) splat(field, gridW, gridH, c.lat, c.lon, c.pop * 0.9, cSig);
    return field;
  }

  // ---- Colour ramp: dark → magenta → orange → yellow → white --------------
  // Heat-style but tuned to read on a dark ocean.
  const RAMP_STOPS = [
    [0.0, [8, 12, 40, 0]],
    [0.06, [30, 18, 90, 90]],
    [0.18, [90, 24, 130, 170]],
    [0.34, [180, 40, 110, 220]],
    [0.52, [232, 78, 60, 240]],
    [0.70, [250, 150, 40, 252]],
    [0.86, [255, 214, 90, 255]],
    [1.0, [255, 255, 240, 255]],
  ];
  function buildRamp(n) {
    n = n || 256;
    const ramp = new Uint8ClampedArray(n * 4);
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      let a = RAMP_STOPS[0], b = RAMP_STOPS[RAMP_STOPS.length - 1];
      for (let k = 1; k < RAMP_STOPS.length; k++) {
        if (t <= RAMP_STOPS[k][0]) { a = RAMP_STOPS[k - 1]; b = RAMP_STOPS[k]; break; }
      }
      const u = (t - a[0]) / Math.max(1e-6, b[0] - a[0]);
      for (let c = 0; c < 4; c++) ramp[i * 4 + c] = Math.round(lerp(a[1][c], b[1][c], u));
    }
    return ramp;
  }

  // Fixed reference density: roughly the field value at the world's densest
  // modern node, so 2025 megacity cores hit near white and antiquity glows dim.
  const DREF = 320;
  function fieldToColorIndex(v, n) {
    let s = v / DREF;
    s = Math.pow(Math.min(1, s), 0.62); // gamma: lift low densities
    return Math.min(n - 1, Math.max(0, Math.round(s * (n - 1))));
  }

  return {
    REGIONS, NODES, CITIES, ERAS, EVENTS, TIMELINE, WORLD_TOTALS, PROJECTIONS, PEAK,
    SHARE_YEARS, SHARES,
    worldTotalAt, yearFromT, tFromYear, regionShareAt, regionPopAt, eraLabel,
    activeNodes, activeCities, computeDensity,
    buildRamp, fieldToColorIndex,
    REGION_SIGMA_DEG, CITY_SIGMA_DEG, DREF,
  };
});
