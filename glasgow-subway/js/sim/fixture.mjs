// Synthetic subway.json-shaped data for unit tests and as an offline fallback in the test harness.
// NOT real geometry: a wobbly ellipse loop of ~10.4 km with 15 stations, matching the SPEC schema.
const NAMES = ['Buchanan Street', 'St Enoch', 'Bridge Street', 'West Street', 'Shields Road', 'Kinning Park', 'Cessnock', 'Ibrox', 'Govan', 'Partick', 'Kelvinhall', 'Hillhead', 'Kelvinbridge', 'St George\'s Cross', 'Cowcaddens'];

function loop(offset, reverse, rng) {
  const a = 2150 - offset, b = 880 - offset, pts = [];
  const N = 4000;
  for (let i = 0; i <= N; i++) {
    const t = (i / N) * Math.PI * 2;
    const wob = 1 + 0.06 * Math.sin(3 * t + 0.4) + 0.03 * Math.sin(5 * t);
    pts.push({ x: a * wob * Math.cos(t), z: b * wob * Math.sin(t) });
  }
  if (reverse) pts.reverse();
  // distance + y
  let s = 0; const out = [];
  for (let i = 0; i < pts.length; i++) {
    if (i) s += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
    out.push({ x: pts[i].x, z: pts[i].z, s });
  }
  const L = s;
  for (const p of out) p.y = 14 + 7 * Math.sin(p.s / L * Math.PI * 6) + 2.5 * Math.sin(p.s / L * Math.PI * 22);
  return out.map((p) => ({ x: +p.x.toFixed(2), y: +p.y.toFixed(2), z: +p.z.toFixed(2), s: +p.s.toFixed(2) }));
}

export function makeFixture() {
  const outer = loop(0, false), inner = loop(3.4, true);
  const Lo = outer[outer.length - 1].s, Li = inner[inner.length - 1].s;
  const stations = [];
  const stopsOuter = [], stopsInner = [];
  for (let i = 0; i < 15; i++) {
    const so = ((i + 0.5) / 15) * Lo;
    const idx = outer.findIndex((p) => p.s >= so);
    const p = outer[idx];
    const type = ['island', 'island', 'side', 'island', 'split', 'island', 'island', 'side', 'island', 'island', 'island', 'island', 'island', 'island', 'island'][i];
    // inner station: nearest inner point
    let best = 0, bd = 1e12;
    for (let j = 0; j < inner.length; j += 4) { const d = Math.hypot(inner[j].x - p.x, inner[j].z - p.z); if (d < bd) { bd = d; best = j; } }
    const q = inner[best];
    stopsOuter.push({ station: 'st' + i, s: +(so + 25).toFixed(1), dwellS: 25 });
    stopsInner.push({ station: 'st' + i, s: +(q.s + 25).toFixed(1), dwellS: 25 });
    stations.push({
      id: 'st' + i, name: NAMES[i], order: i, lat: 55.86, lon: -4.27, x: p.x, z: p.z, surfaceY: p.y + 9 + (i % 4) * 4, railY: p.y, depth: 9 + (i % 4) * 4,
      platform: { type, lengthM: 49, widthM: type === 'island' ? 5.4 : 3.2, headingDeg: 90, centreX: p.x, centreZ: p.z, tracks: { outer: { x: p.x, z: p.z }, inner: { x: q.x, z: q.z } } },
      entrances: [{ name: NAMES[i] + ' entrance', x: p.x + 30, z: p.z + 20, kind: 'street' }],
      summary: 'Test station ' + NAMES[i], description: 'Synthetic.', facts: ['Fact one about ' + NAMES[i] + '.', 'Fact two: opened 1896.'], nearby: ['Landmark A', 'Landmark B'],
      architecture: 'Island platform; tiled walls.', interchange: i % 5 === 0 ? ['National Rail: Test'] : [],
    });
  }
  stopsInner.sort((a, b) => a.s - b.s);
  // inner runs in reverse order of the stations; resort by s and keep
  return {
    meta: { name: 'Fixture', operator: 'Test', stations: 15, gauge_mm: 1220, tunnel_diameter_m: 3.35 },
    stations,
    tracks: {
      outer: { name: 'Outer Circle', direction: 'clockwise', closed: true, points: outer, stops: stopsOuter, speedLimits: [{ s0: 0, s1: 400, kmh: 40 }] },
      inner: { name: 'Inner Circle', direction: 'anticlockwise', closed: true, points: inner, stops: stopsInner, speedLimits: [] },
    },
    tunnel: { innerDiameterM: 3.35, riverCrossings: [] },
    rollingStock: { current: { cars: 2, length_m: 39, width_m: 2.3, capacity: 240, max_speed_kmh: 55, accel: 1.0, decel: 1.0, mass_t: 54 } },
    timeline: [],
  };
}
