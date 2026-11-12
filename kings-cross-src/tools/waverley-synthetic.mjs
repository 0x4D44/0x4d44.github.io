// A synthetic busy Waverley, for test runs only (tools/perf.mjs --synthetic-trains; capture work on the Edinburgh kinds). The made-up trains of
// waverley-synthetic.json stand on, or run through, Waverley's platform tracks: no Network Rail data, no berths, no headcodes, no relay. The routes come
// from the page's own committed geometry (web/src/data/waverley-scene.json) and its platform screening (core/waverley-anchors.ts); the cars are built
// by the page's own hook (window.__kx.evidenceBuildEdinburgh) and posed by poseCars, which the tests hold to the page's carPoses.
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { shapeFrom } from '../core/curves.ts';
import { buildGraph } from '../core/graph.ts';
import { decodeWaverleyAnchorScene, waverleyPlatformGeometry, waverleyTrackData } from '../core/waverley-anchors.ts';
import { EDINBURGH_FLEET, capturePairFormation } from '../web/src/edinburgh-fleet.ts';

export const SYNTHETIC_FILE = fileURLToPath(new URL('./waverley-synthetic.json', import.meta.url));
const SCENE_FILE = fileURLToPath(new URL('../web/src/data/waverley-scene.json', import.meta.url));
/** How far a route is walked each way from its platform: far enough for a standing train, as far as the open track goes for a moving one. */
export const SYNTHETIC_REACH = Object.freeze({ standingM: 400, movingM: 1500, maxTurnDeg: 25, sampleM: 2, gapM: 3 });

/** A kind's cars as carPoses reads them (index and bogie distances from the nose) and its length: a fleet row's layout, or a capture pair's formation. */
export function syntheticLayout(kind) {
  const row = EDINBURGH_FLEET.find((r) => r.kind === kind);
  const layout = row ? row.layout() : capturePairFormation(kind);
  if (!layout) throw new Error(`synthetic Waverley: ${kind} is neither an Edinburgh fleet row nor a capture pair`);
  return { length: layout.length, cars: layout.cars.map((c) => ({ index: c.index, end: c.end, bogies: [c.bogies[0], c.bogies[1]] })) };
}

/**
 * Walks the graph away from `node` (arrived at from `prev`), always on the straightest untunnelled edge that turns less than maxTurnDeg, until `budgetM`
 * or the open track ends. Returns the nodes beyond `node`.
 */
function walk(graph, prev, node, budgetM, maxTurnDeg) {
  const out = [], minCos = Math.cos((maxTurnDeg * Math.PI) / 180);
  let dist = 0;
  while (dist < budgetM) {
    const p = graph.pos.get(prev), q = graph.pos.get(node), lin = Math.hypot(q[0] - p[0], q[1] - p[1]);
    let best = null;
    for (const edge of graph.adj.get(node) ?? []) {
      const next = edge.a === node ? edge.b : edge.a;
      if (next === prev || edge.tunnel || out.includes(next)) continue;
      const r = graph.pos.get(next), lout = Math.hypot(r[0] - q[0], r[1] - q[1]);
      if (!(lout > 0)) continue;
      const cos = ((q[0] - p[0]) * (r[0] - q[0]) + (q[1] - p[1]) * (r[1] - q[1])) / (lin * lout);
      if (cos >= minCos && (!best || cos > best.cos)) best = { next, cos, length: lout };
    }
    if (!best) break;
    out.push(best.next); dist += best.length; prev = node; node = best.next;
  }
  return out;
}

const cumulative = (points) => points.reduce((cum, p, i) => (i ? [...cum, cum[i - 1] + Math.hypot(p[0] - points[i - 1][0], p[1] - points[i - 1][1])] : [0]), []);
/** The point `s` metres along a route. */
export function routePoint({ points, cum }, s) {
  let i = 0;
  while (i < points.length - 2 && cum[i + 1] < s) i++;
  const a = points[i], b = points[i + 1], u = (s - cum[i]) / (cum[i + 1] - cum[i]);
  return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u];
}
/** Points every `stepM` metres along a route from s0 to s1 (both ends included). */
export function routeSamples(route, s0, s1, stepM = SYNTHETIC_REACH.sampleM) {
  const n = Math.max(1, Math.ceil((s1 - s0) / stepM));
  return Array.from({ length: n + 1 }, (_, i) => routePoint(route, s0 + ((s1 - s0) * i) / n));
}
/** The part of a route from s0 to s1, as a route of its own. */
function sliceRoute(route, s0, s1) {
  const inner = route.points.filter((_, i) => route.cum[i] > s0 + 1e-6 && route.cum[i] < s1 - 1e-6);
  const points = [routePoint(route, s0), ...inner, routePoint(route, s1)];
  return { points, cum: cumulative(points) };
}
/** The first claim ({ p, id }) within gapM of p, or undefined. */
const clash = (p, claimed, gapM = SYNTHETIC_REACH.gapM) => claimed.find(({ p: q }) => Math.abs(p[0] - q[0]) < gapM && Math.abs(p[1] - q[1]) < gapM && Math.hypot(p[0] - q[0], p[1] - q[1]) < gapM);
const at = (p) => `(${p.map((v) => v.toFixed(0)).join(', ')})`;

/**
 * The plan of every train of the timetable: its route (a polyline [x, z] and the distance to each point), its cars, where its nose starts and, for a moving
 * train, the stretch it loops over. A standing train is centred on its platform's screened track; a moving one starts there too and runs on at its speed.
 * No two trains ever meet: every train starts at least gapM from every other, and a moving train's route is cut short where it would come within gapM of
 * another train's starting place or of an earlier moving train's run, so it loops over track of its own. Throws on a platform with no screened track, a
 * train that does not fit its route, two trains that start where they meet (naming both and the place), or a moving train left less than its own length to run.
 */
export function syntheticPlan(sceneJson, timetable) {
  const placed = placeTrains(sceneJson, timetable), claimed = [];
  const body = (t) => routeSamples(t.route, t.noseS - t.lengthM, t.noseS);
  // every train's starting body first, so that no moving train's run is cut by a body it has not yet met
  for (const t of placed) {
    const mine = body(t);
    for (const p of mine) { const hit = clash(p, claimed); if (hit) throw new Error(`synthetic Waverley: ${hit.id} and ${t.id} meet at ${at(p)}`); }
    claimed.push(...mine.map((p) => ({ p, id: t.id })));
  }
  const trains = placed.map((t) => {
    if (!t.speedMps) return t;
    // from the train's own body outwards, the first sample that meets another train's claim ends the route that way
    const { route } = t, step = SYNTHETIC_REACH.sampleM, end = route.cum.at(-1), others = claimed.filter((c) => c.id !== t.id);
    const own = (s) => !clash(routePoint(route, s), others);
    let s0 = t.noseS - t.lengthM, s1 = t.noseS;
    while (s0 - step >= 0 && own(s0 - step)) s0 -= step;
    while (s1 + step <= end && own(s1 + step)) s1 += step;
    const cut = sliceRoute(route, s0, s1), runM = s1 - s0 - t.lengthM;
    if (runM < t.lengthM) throw new Error(`synthetic Waverley ${t.id}: its own track leaves ${t.kind} ${runM.toFixed(0)} m to run, less than its length`);
    claimed.push(...routeSamples(cut, 0, s1 - s0).map((p) => ({ p, id: t.id })));
    return { ...t, route: cut, noseS: t.noseS - s0, loop: [t.lengthM, s1 - s0] };
  });
  return { note: timetable.note, trains };
}

export function placeTrains(sceneJson, timetable) {
  const scene = decodeWaverleyAnchorScene(sceneJson), graph = buildGraph(waverleyTrackData(scene), { curves: true });
  const platforms = new Map(waverleyPlatformGeometry(scene).map((p) => [p.ref, p]));
  return timetable.trains.map((entry) => {
    const { id, kind, platform, heading } = entry, speedMps = entry.speedMps ?? 0;
    if (!/^SYN-\d{2}$/.test(id)) throw new Error(`synthetic Waverley: ${id} is not a SYN-nn id (no real headcode may stand in for one)`);
    if (!['east', 'west'].includes(heading)) throw new Error(`synthetic Waverley ${id}: heading must be east or west`);
    if (!(speedMps >= 0)) throw new Error(`synthetic Waverley ${id}: speedMps must be zero or more`);
    const track = [...(platforms.get(platform)?.candidates ?? [])].sort((a, b) => b.coverageM - a.coverageM)[0];
    if (!track) throw new Error(`synthetic Waverley ${id}: platform ${platform} has no screened track`);
    const reach = speedMps > 0 ? SYNTHETIC_REACH.movingM : SYNTHETIC_REACH.standingM;
    const back = walk(graph, track.to, track.from, reach, SYNTHETIC_REACH.maxTurnDeg), ahead = walk(graph, track.from, track.to, reach, SYNTHETIC_REACH.maxTurnDeg);
    let nodes = [...back.reverse(), track.from, track.to, ...ahead], at = back.length + track.t;
    if ((heading === 'east') !== (graph.pos.get(nodes.at(-1))[0] > graph.pos.get(nodes[0])[0])) { nodes = nodes.reverse(); at = nodes.length - 1 - at; }
    // the route runs on the curves the page draws and the live graph carries (edinburgh-live.ts, {curves: true}): each edge's curve, joined at the nodes
    const points = [[...shapeFrom(graph.shapes, nodes[0], nodes[1])[0]]], atNode = [0];
    for (let k = 0; k + 1 < nodes.length; k++) { points.push(...shapeFrom(graph.shapes, nodes[k], nodes[k + 1]).slice(1).map((p) => [...p])); atNode.push(points.length - 1); }
    // the middle of the train: the screened point of the platform's track (a share t of its edge's curve, as edgePoint reads it), moved offsetM along the heading
    const cum = cumulative(points), i = Math.floor(at), si = cum[atNode[i]], centreS = si + (at - i) * ((cum[atNode[i + 1]] ?? si) - si) + (entry.offsetM ?? 0);
    const layout = syntheticLayout(kind), noseS = centreS + layout.length / 2, routeM = cum.at(-1);
    if (noseS - layout.length < 0 || noseS > routeM) throw new Error(`synthetic Waverley ${id}: ${kind} (${layout.length.toFixed(1)} m) does not fit the ${routeM.toFixed(0)} m route at platform ${platform}`);
    return { id, kind, platform, heading, speedMps, lengthM: layout.length, cars: layout.cars, noseS, loop: null, route: { points, cum } };
  });
}

/** syntheticPlan of the committed timetable over the committed Waverley geometry. */
export async function loadSyntheticPlan(file = SYNTHETIC_FILE) {
  const [scene, timetable] = await Promise.all([readFile(SCENE_FILE, 'utf8'), readFile(file, 'utf8')]);
  return syntheticPlan(JSON.parse(scene), JSON.parse(timetable));
}

/**
 * The cars of a train on a route with its nose `noseS` metres along it, posed as the page's carPoses (web/src/trains-live.ts) poses them on the same
 * polyline: each car on the chord between its two bogies, stretched to it, each bogie square to the track under it. Self-contained: it runs in the page.
 */
export function poseCars(route, cars, noseS) {
  const { points, cum } = route;
  const at = (s) => {
    let lo = 0, hi = points.length - 2;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (cum[mid] <= s) lo = mid; else hi = mid - 1; }
    const a = points[lo], b = points[lo + 1], length = cum[lo + 1] - cum[lo], t = (s - cum[lo]) / length;
    return { point: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], back: [(a[0] - b[0]) / length, (a[1] - b[1]) / length] };
  };
  const poses = [];
  for (const car of cars) {
    const s0 = noseS - car.bogies[0], s1 = noseS - car.bogies[1];
    if (s1 < 0 || s0 > cum.at(-1)) continue;
    const frontBogie = at(s0), rearBogie = at(s1);
    const dx = rearBogie.point[0] - frontBogie.point[0], dz = rearBogie.point[1] - frontBogie.point[1], chord = Math.hypot(dx, dz);
    if (chord < 1e-8) continue;
    const scaleZ = chord / (car.bogies[1] - car.bogies[0]);
    poses.push({ car, frontBogie, rearBogie, rotationY: Math.atan2(dx, dz), scaleZ,
      position: [frontBogie.point[0] - (dx / chord) * scaleZ * car.bogies[0], frontBogie.point[1] - (dz / chord) * scaleZ * car.bogies[0]] });
  }
  return poses;
}

/**
 * The page script that puts the plan's trains into the Waverley scene on show (window.__kx.stations.edinburgh().scene), built by the page's own
 * evidenceBuildEdinburgh, and moves the moving ones every animation frame. Returns the summary; run twice it adds nothing. window.__kx.synthetic.summary()
 * counts the trains and cars, the moving trains and how far they have run, and the trains with a car whose middle is inside the camera's view.
 */
export function syntheticScript(plan) {
  return `(() => {
  const k = window.__kx, view = k.stations?.edinburgh?.();
  if (!view?.scene || !view.geometry) throw new Error('synthetic Waverley: the Waverley scene is not loaded');
  if (k.synthetic) return k.synthetic.summary();
  if (typeof k.evidenceBuildEdinburgh !== 'function') throw new Error('synthetic Waverley: the page has no evidenceBuildEdinburgh hook');
  const poseCars = ${poseCars.toString()};
  const plan = ${JSON.stringify(plan)};
  const V = k.camera.position.constructor;
  const trains = plan.trains.map((t) => {
    const group = k.evidenceBuildEdinburgh(t.kind);
    if (!group) throw new Error('synthetic Waverley: the page cannot build ' + t.kind);
    group.name = 'synthetic-' + t.id;
    Object.assign(group.userData, { synthetic: true, id: t.id, kind: t.kind });
    view.scene.add(group);
    return { ...t, group, travelledM: 0, middles: [] };
  });
  const place = (t) => {
    for (const car of t.group.children) car.visible = false;
    t.middles = [];
    for (const pose of poseCars(t.route, t.cars, t.noseS)) {
      const car = t.group.getObjectByName('car-' + pose.car.index);
      if (!car) continue;
      car.visible = true; car.position.set(pose.position[0], 0, pose.position[1]); car.rotation.y = pose.rotationY; car.scale.z = pose.scaleZ;
      [pose.frontBogie, pose.rearBogie].forEach((sample, j) => {
        const bogie = car.getObjectByName('bogie-' + pose.car.index + '-' + j);
        if (bogie) bogie.rotation.y = Math.atan2(sample.back[0], sample.back[1]) - pose.rotationY;
      });
      t.middles.push([(pose.frontBogie.point[0] + pose.rearBogie.point[0]) / 2, 2, (pose.frontBogie.point[1] + pose.rearBogie.point[1]) / 2]);
    }
  };
  for (const t of trains) place(t);
  let last = null;
  const tick = (now) => {
    const dt = last === null ? 0 : Math.min(0.25, (now - last) / 1000);
    last = now;
    for (const t of trains) {
      if (!t.loop) continue;
      const step = t.speedMps * dt, span = t.loop[1] - t.loop[0];
      t.travelledM += step; t.noseS = t.loop[0] + ((t.noseS - t.loop[0] + step) % span);
      place(t);
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  const inView = (t) => t.group.visible && t.middles.some((m) => {
    const p = view.scene.localToWorld(new V(m[0], m[1], m[2])).project(k.camera);
    return Math.abs(p.x) <= 1 && Math.abs(p.y) <= 1 && p.z >= -1 && p.z <= 1;
  });
  k.synthetic = { trains, summary: () => {
    k.camera.updateMatrixWorld(); view.scene.updateMatrixWorld();
    const moving = trains.filter((t) => t.loop);
    return { trains: trains.length, standing: trains.length - moving.length, moving: moving.length, cars: trains.reduce((n, t) => n + t.middles.length, 0),
      kinds: [...new Set(trains.map((t) => t.kind))], inView: trains.filter(inView).length, inViewIds: trains.filter(inView).map((t) => t.id),
      travelledM: Math.round(moving.reduce((n, t) => n + t.travelledM, 0) * 10) / 10 };
  } };
  return k.synthetic.summary();
})()`;
}
