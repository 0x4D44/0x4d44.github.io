// tools/build-waverley-lamp-roads.ts and the file it writes (web/src/data/waverley-lamp-roads.json): the Scottish street lamps' roads, lean. The committed file is what the tool makes of the W3 city
// element's waverley-roads.json, it holds every line of the lit classes and nothing else, and it stays small: it is loaded with the Scottish scene and counts toward the app's payload.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { gzipSync } from 'node:zlib';
import { ROAD_CLASS } from '../../core/city.ts';
import type { RoadClass } from '../../core/city.ts';
import type { Pt } from '../../core/geo.ts';
import { decodeLampRoads, LAMP_RULES } from '../../core/streetlights.ts';
import type { LampRoadsFile } from '../../core/streetlights.ts';
import { LAMP_CLASSES, leanRoads, STEP } from '../build-waverley-lamp-roads.ts';
import type { RoadsSource } from '../build-waverley-lamp-roads.ts';

const text = (name: string): string => readFileSync(new URL(`../../web/src/data/${name}`, import.meta.url), 'utf8');
const source: RoadsSource & { extent: { x0: number; z0: number; x1: number; z1: number } } = JSON.parse(text('waverley-roads.json'));
const committed = text('waverley-lamp-roads.json');
const lean: LampRoadsFile = JSON.parse(committed);

test('the committed lean file is what the tool makes of waverley-roads.json: regenerating it changes nothing', () => {
  assert.equal(`${JSON.stringify(leanRoads(source))}\n`, committed, 'run `node tools/build-waverley-lamp-roads.ts` from kings-cross-src and commit the file');
});

test('the lean file holds every line of the lit classes, bridges apart, and nothing else: the source\'s service roads, footways, steps and tracks are not in it', () => {
  const lit = (highway: string): RoadClass | undefined => {
    const cls = ROAD_CLASS[highway];
    return cls && LAMP_CLASSES.includes(cls) ? cls : undefined;
  };
  const decoded = decodeLampRoads(lean);
  for (const bridge of [false, true]) {
    for (const cls of LAMP_CLASSES) {
      const want = source.roads.filter((r) => lit(r.highway) === cls && (r.bridge === true) === bridge && r.path.length >= 2).map((r) => r.path);
      const got = decoded.filter((r) => r.cls === cls && r.bridge === bridge).map((r) => r.line);
      assert.deepEqual(got, want, `${cls}${bridge ? ' decks' : ''}: the lines, point for point and in the source's order`);
    }
  }
  // what is left out
  const left = source.roads.filter((r) => !lit(r.highway));
  assert.ok(left.length > 300, `${left.length} lines left out`);
  assert.ok(left.some((r) => r.highway === 'service') && left.some((r) => r.highway === 'footway'), 'service roads and footways among them');
  assert.equal(decoded.length, source.roads.length - left.length, 'and every other line is in');
  // every lit class has a lamp rule (a class with none would be loaded and never lit), and none of them is a path
  for (const cls of LAMP_CLASSES) assert.ok(LAMP_RULES[cls], `${cls} has a lamp rule`);
  assert.ok(!LAMP_CLASSES.includes('path') && !LAMP_CLASSES.includes('cycleway'));
  // the decks that matter are among them: North Bridge, Waverley Bridge (three ways), South Bridge, George IV Bridge, Waterloo Place
  const decks = decoded.filter((r) => r.bridge);
  const near = (p: Pt, q: Pt): boolean => Math.hypot(p[0] - q[0], p[1] - q[1]) < 1;
  const has = (a: Pt, b: Pt): boolean => decks.some((d) => (near(d.line[0] as Pt, a) && near(d.line[d.line.length - 1] as Pt, b)) || (near(d.line[0] as Pt, b) && near(d.line[d.line.length - 1] as Pt, a)));
  assert.ok(has([103, -87], [148, 76.5]), 'North Bridge');
  assert.ok(has([-62.5, 85.5], [-74.5, 40.5]) && has([-74.5, 40.5], [-84, 5.5]) && has([-84, 5.5], [-93, -26]), 'Waverley Bridge');
  assert.ok(has([218.5, 344], [224, 362]) && has([-92.5, 418.5], [-96.5, 406.5]) && has([190, -194], [209.5, -200]), 'South Bridge, George IV Bridge and Waterloo Place');
});

test('the lean file keeps OpenStreetMap\'s attribution and licence, says where it comes from, and holds no id, name or tag: only classes, decks and lines', () => {
  assert.equal(lean.attribution, source.attribution);
  assert.equal(lean.licence, source.licence);
  assert.match(lean.attribution, /OpenStreetMap contributors \(ODbL\)/);
  assert.match(lean.licence, /ODbL 1\.0/);
  assert.match(lean.source, /waverley-roads\.json/);
  assert.match(lean.source, /build-waverley-lamp-roads\.ts/);
  assert.equal(lean.frame, source.frame);
  assert.equal(lean.unit, STEP);
  assert.deepEqual(Object.keys(lean), ['attribution', 'licence', 'source', 'frame', 'extent', 'unit', 'ways', 'bridges']);
  assert.deepEqual(lean.extent, source.extent, 'the terrain the lines are clipped to');
  assert.ok(Object.keys(lean.ways).every((cls) => LAMP_CLASSES.includes(cls as RoadClass)) && Object.keys(lean.bridges).every((cls) => LAMP_CLASSES.includes(cls as RoadClass)));
  // the classes are in the order the tool puts them in, whatever order the source met them in
  assert.deepEqual(Object.keys(lean.ways), LAMP_CLASSES.filter((cls) => lean.ways[cls]));
  assert.ok(!/way\//.test(committed), 'no OSM way id in it');
});

test('the lean file stays small and inside the scene: it is loaded with the Scottish scene and counts toward the app\'s payload, and every point is on the terrain', () => {
  const gz = gzipSync(committed, { level: 9 }).length;
  const wholeSource = gzipSync(text('waverley-roads.json'), { level: 9 }).length;
  assert.ok(gz < 6500, `${gz} bytes gzipped (the OSM lines it is made from: ${wholeSource})`);
  assert.ok(gz < wholeSource / 3, 'a third of its source or less');
  const { x0, z0, x1, z1 } = lean.extent;
  for (const road of decodeLampRoads(lean)) {
    assert.ok(road.line.length >= 2, 'a line has two points at least');
    for (const [x, z] of road.line) {
      assert.ok(x >= x0 && x <= x1 && z >= z0 && z <= z1, `${road.cls} point ${x}, ${z} is on the terrain`);
      assert.ok(Number.isInteger(x / STEP) && Number.isInteger(z / STEP), 'on a whole half metre');
    }
  }
});
