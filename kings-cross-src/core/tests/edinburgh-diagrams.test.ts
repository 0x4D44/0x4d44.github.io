import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bookedSource, daysMask, firstEvidence, matchBooked, parseDateNote, parseDiagramText, parseHeader, validateFleetTable } from '../edinburgh-diagrams.ts';
import type { BookedWorking, FleetTable } from '../edinburgh-diagrams.ts';
import type { EdinburghServiceEvidence } from '../train-neutral.ts';

// Everything below is invented: diagram ids, headcodes and times are not any operator's. Only the layout and the
// header wording follow the published report.

test('parseHeader maps every published header wording onto (class, vehicles)', () => {
  const wordings: [string, { class: string; vehicles: number } | undefined][] = [
    ['Class 385 - 3 Car EMU', { class: '385', vehicles: 3 }],
    ['Class 385 - 4 car EMU', { class: '385', vehicles: 4 }],
    ['Class 334 - 3 Car EMU HAGF', { class: '334', vehicles: 3 }],
    ['Class 380 - 3 car EMU HAGM', { class: '380', vehicles: 3 }],
    ['Class 380 - 4 car EMU HAGN', { class: '380', vehicles: 4 }],
    ['Class 320 - 3 Car EMU HAGA', { class: '320', vehicles: 3 }],
    ['Class 320/4 - 3 car EMU HAGA', { class: '320', vehicles: 3 }],
    ['Class 318 - 3 Car EMU HAGG', { class: '318', vehicles: 3 }],
    ['Class 170 3 Car Turbo HAHT', { class: '170', vehicles: 3 }],
    ['Class 170 3 Car Sub HAHS', { class: '170', vehicles: 3 }],
    ['Class 158 2 car HAIE', { class: '158', vehicles: 2 }],
    ['Class 158 2 Car', { class: '158', vehicles: 2 }],
    ['Class 156 2 Car SPT HACX', { class: '156', vehicles: 2 }],
    ['Class 156 2 Car PSO HACN', { class: '156', vehicles: 2 }],
    ['Class 153 1 Car PSO HACN', { class: '153', vehicles: 1 }],
    // An HST is class 43; its vehicles are the coaches plus the two power cars.
    ['Class HST - 4 Coaches', { class: '43', vehicles: 6 }],
    ['Class HST - 5 Coaches', { class: '43', vehicles: 7 }],
    // Not a unit: a path booked for a train not yet allocated.
    ['Class Diesel Q Path', undefined],
    ['Class Electric Q Path', undefined],
    // Wording that is not understood exactly stays unknown rather than guessed.
    ['Class 385 - 3 Coaches', undefined],
    ['Class HST - 5 Car', undefined],
    ['Class 385 - 0 Car EMU', undefined],
    ['Class 385 EMU', undefined],
    ['385 - 3 Car EMU', undefined],
  ];
  assert.deepEqual(wordings.map(([text]) => parseHeader(text)), wordings.map(([, expected]) => expected));
});

test('daysMask: only-codes list the days, X-codes are Monday to Friday less the days, Sun stands alone', () => {
  const bits = (code: string): number[] | undefined => {
    const mask = daysMask(code);
    return mask === undefined ? undefined : [0, 1, 2, 3, 4, 5, 6].filter(d => mask & (1 << d)); // Mon = 0 ... Sun = 6
  };
  assert.deepEqual(bits('SX'), [0, 1, 2, 3, 4]);
  assert.deepEqual(bits('SO'), [5]);
  assert.deepEqual(bits('Sun'), [6]);
  assert.deepEqual(bits('MO'), [0]);
  assert.deepEqual(bits('FO'), [4]);
  assert.deepEqual(bits('MX'), [1, 2, 3, 4]);
  assert.deepEqual(bits('FSX'), [0, 1, 2, 3]);
  assert.deepEqual(bits('MSX'), [1, 2, 3, 4]);
  assert.deepEqual(bits('ThSX'), [0, 1, 2, 4]);
  assert.deepEqual(bits('TWThO'), [1, 2, 3]);
  assert.deepEqual(bits('TThFO'), [1, 3, 4]);
  assert.deepEqual(bits('MWThO'), [0, 2, 3]);
  for (const bad of ['', 'X', 'O', 'SunX', 'Mon', 'SXO', 'sx', 'MTWThFX', 'SS O']) assert.equal(daysMask(bad), undefined, `rejects ${JSON.stringify(bad)}`);
});

test('parseDateNote reads every published date-note wording and refuses the rest', () => {
  const y = 2026;
  assert.deepEqual(parseDateNote('Operates until 27th September', y), { until: '2026-09-27' });
  assert.deepEqual(parseDateNote('Operates until 24th  September', y), { until: '2026-09-24' });
  assert.deepEqual(parseDateNote('Operates from 28th September', y), { from: '2026-09-28' });
  assert.deepEqual(parseDateNote('Operates from 2nd October', y), { from: '2026-10-02' });
  assert.deepEqual(parseDateNote('Operates 4th to 18th October', y), { from: '2026-10-04', until: '2026-10-18' });
  assert.deepEqual(parseDateNote('Operates 4 to 18 October', y), { from: '2026-10-04', until: '2026-10-18' });
  assert.deepEqual(parseDateNote('Operates 27th September to 4th October', y), { from: '2026-09-27', until: '2026-10-04' });
  assert.deepEqual(parseDateNote('Operates 27th September until 4th October', y), { from: '2026-09-27', until: '2026-10-04' });
  assert.deepEqual(parseDateNote('Operates from 4th - 18th October', y), { from: '2026-10-04', until: '2026-10-18' });
  assert.deepEqual(parseDateNote('Operates 28th December to 3rd January', y), { from: '2026-12-28', until: '2027-01-03' });
  for (const bad of ['Operates On Glasgow City Council School Holidays Only', 'Operates until 31st September', 'Operates', '', 'Operates until Tuesday']) assert.equal(parseDateNote(bad, y), undefined, bad);
});

// A synthetic report. AA101 is a 385 3-car, AA103 another, AA104 a 385 4-car.
const REPORT = `
Vehicle Diagram Detail Report
Diagram ID ZZ ZZ101
Days SX
Class 385 - 3 Car EMU
Duration 16:15
Distance 338.8
Location Arr Dep Activity Train Distance Vehicle Cover
Sidings One 07:05 CS 0
Sidings One 07:10 07:10 5A01LA 2.1 ZZ103 / ZZ101
Terminus One07:18 07:30 1A01LA 49.2 ZZ101 / ZZ103
Edinburgh 08:22 08:31½ 1A02LA 96.2 ZZ103 / ZZ101
Terminus One 09:16 09:32 1A03LA 143.2 ZZ101 / ZZ103
Edinburgh 10:23 10:35 5A04LD 148.1 ZZ101 / ZZ103
Sidings Two 10:51 10:51 CS 148.1
10:58 Detach 5A04LD 148.1 ZZ101, ZZ103
Sidings Two Wash 148.1
Attach 5A05LC 148.1 ZZ101, ZZ104
# Classified as NOT CLASSIFIED
PAGE 245
Sidings Two 16:03 CS 148.1
Sidings Two 16:10 16:11 5A05LC 152.9 ZZ101 / ZZ104
Edinburgh 16:23 16:40 2A06LB 174.8 ZZ104 / ZZ101
North Berwick 17:13 17:22 2A07LB 196.7 ZZ101 / ZZ104
Edinburgh 17:55 18:15 2A08LB 218.5 ZZ104 / ZZ101
Dunbar 22:46 22:54 5A09LA 338.8 ZZ101 / ZZ104
Edinburgh 23:50 1&00:10 2A10LA 340.0 ZZ104 / ZZ101
Edinburgh 1&00:30 Clean 340.0
Edinburgh
Diagram ID ZZ ZZ104
Days SX
Class 385 - 4 car EMU
Duration 12:00
Distance 100.0
Location Arr Dep Activity Train Distance Vehicle Cover
Sidings Two 16:10 16:11 5A05LC 152.9 ZZ101 / ZZ104
Edinburgh 16:23 16:40 2A06LB 174.8 ZZ104 / ZZ101
Edinburgh
Diagram ID ZZ ZZ106
Days SX
Class 385 - 3 Car EMU
Duration 02:00
Distance 20.0
Location Arr Dep Activity Train Distance Vehicle Cover
Edinburgh Park 17:00 17:01 2M01LB 180.0
Edinburgh Gateway 17:05 17:06 2M01LB 181.0
Haymarket 17:10 17:12 2M01LB 182.0
Haymarket
Diagram ID ZZ ZZ103
Days SX
Class 385 - 3 Car EMU
Duration 01:00
Distance 0
Location Arr Dep Activity Train Distance Vehicle Cover
Sidings One Stabld 0
Sidings One
Diagram ID ZZ ZZ201
Days SO
Date Notes Operates until 27th September
Class 158 2 Car
Duration 04:00
Distance 80.0
Location Arr Dep Activity Train Distance Vehicle Cover
Terminus Two 11:00 11:10 1B01LA 1.0 ZZ201 / ZZ202
Edinburgh 12:03 12:20 1B01LA 50.0 ZZ201 / ZZ202
Edinburgh
Diagram ID ZZ ZZ201
Days SO
Date Notes Operates from 28th September
Class 158 2 Car
Duration 04:00
Distance 80.0
Location Arr Dep Activity Train Distance Vehicle Cover
Terminus Two 11:00 11:10 1B01LA 1.0
Edinburgh 12:03 12:20 1B01LA 50.0
Edinburgh
Diagram ID ZZ ZZ202
Days SO
Date Notes Operates until 27th September
Class 158 2 car HAIE
Duration 01:00
Distance 0
Location Arr Dep Activity Train Distance Vehicle Cover
Sidings Two Stabld 0
Sidings Two
Diagram ID ZZ ZZ301
Days Sun
Class HST - 4 Coaches
Duration 05:00
Distance 90.0
Location Arr Dep Activity Train Distance Vehicle Cover
Edinburgh 14:03 14:20 1C01LA 50.0
Edinburgh
Diagram ID ZZ ZZ302
Days Sun
Class HST - 5 Coaches
Duration 05:00
Distance 90.0
Location Arr Dep Activity Train Distance Vehicle Cover
Edinburgh 15:03 15:20 1C02LA 50.0
Edinburgh
Diagram ID ZZ ZZ401
# Classified as NOT CLASSIFIED
PAGE 300
Days MO
Class 170 3 Car Turbo HAHT
Duration 05:00
Distance 90.0
Location Arr Dep Activity Train Distance Vehicle Cover
Edinburgh 09:03 09:20 1D01LA 20.0 ZZ401 / ZZ402
Edinburgh
Diagram ID ZZ ZZ402
Days MO
Class 158 2 car HAIE
Duration 01:00
Distance 0
Location Arr Dep Activity Train Distance Vehicle Cover
Sidings Two Stabld 0
Sidings Two
Diagram ID ZZ ZZ501
Days FO
Class 170 3 Car Sub HAHS
Duration 08:00
Distance 200.0
Location Arr Dep Activity Train Distance Vehicle Cover
Stirling 09:31 09:34½ 1E01LA 184.7
Edinburgh 10:14 Attach 1E02LM 184.7 ZZ501, ±ZZ502
Edinburgh 10:33 1E02LM 220.2 ZZ501 / ZZ502
Glasgow Central 11:00 11:05 1F01LA 10.0 ZZ501 / ZZ502
Edinburgh 12:11 Detach 1F01LA 59.7 ZZ502, ZZ501
Edinburgh 12:38 5F02LT 106.8
Edinburgh
Diagram ID ZZ ZZ502
Days FO
Class 170 3 Car Sub HAHS
Duration 01:00
Distance 0
Location Arr Dep Activity Train Distance Vehicle Cover
Sidings Two Stabld 0
Sidings Two
Diagram ID ZZ ZZ601
Days SX
Class Diesel Q Path
Duration 01:00
Distance 0
Location Arr Dep Activity Train Distance Vehicle Cover
Edinburgh 04:00 04:10 5G01LA 10.0
Edinburgh
Diagram ID ZZ ZZ701
Days XQ
Class 385 - 3 Car EMU
Duration 01:00
Distance 0
Location Arr Dep Activity Train Distance Vehicle Cover
Edinburgh 05:00 05:10 1H01LA 10.0
Edinburgh
Diagram ID ZZ ZZ702
Days TO
Date Notes Operates On Glasgow City Council School Holidays Only
Class 385 - 3 Car EMU
Duration 01:00
Distance 0
Location Arr Dep Activity Train Distance Vehicle Cover
Edinburgh 06:00 06:10 1H02LA 10.0
Edinburgh
`;

const parsed = parseDiagramText(REPORT, { year: 2026 });
const table: FleetTable = { source: 'synthetic', builtAt: '2026-11-10T09:00:00.000Z', workings: parsed.workings };
const workingsFor = (headcode: string): BookedWorking[] => parsed.workings.filter(w => w.headcode === headcode);
/** Instants for Europe/London in November (GMT: local = UTC). 2026-11-06 is a Friday. */
const gmt = (day: number, hhmm: string): number => Date.UTC(2026, 10, day, Number(hhmm.slice(0, 2)), Number(hhmm.slice(3)));
const unit = (diagram: string, cls: string | null, cars: number | null) => ({ diagram, class: cls, cars });
const evidence = (units: { class: string; cars: number }[], extra: Partial<EdinburghServiceEvidence> = {}): EdinburghServiceEvidence =>
  ({ operator: 'SR', units, ...extra, basis: 'booked diagram' });

test('parseDiagramText: counts, validates, and keeps only the workings that call at Edinburgh', () => {
  assert.deepEqual(parsed.stats, { blocks: 16, skippedDays: 1, skippedDateNote: 1, unclassifiedBlocks: 1 });
  validateFleetTable(table);
  const headcodes = new Set(parsed.workings.map(w => w.headcode));
  // Edinburgh Park and Edinburgh Gateway are other places; the two skipped blocks and a leg that never reaches Edinburgh are out.
  for (const absent of ['2M01', '1H01', '1H02', '5A01']) assert.ok(!headcodes.has(absent), `${absent} is not at Edinburgh`);
  assert.deepEqual([...headcodes].sort(), ['1A01', '1A02', '1A03', '1B01', '1C01', '1C02', '1D01', '1E01', '1E02', '1F01', '2A06', '2A07', '2A08', '2A10', '5A04', '5A05', '5A09', '5F02', '5G01']);
});

test('the Train column is the train that leaves; arrivals come from the previous leg, a Detach row or an Attach row', () => {
  const minutes = (headcode: string): number[][] => workingsFor(headcode).map(w => [...w.edinburghMinutes]);
  assert.deepEqual(minutes('1A01'), [[502]], 'arrived 08:22 on the previous leg');
  assert.deepEqual(minutes('1A02'), [[511.5]], 'left 08:31 and a half; the 08:22 arrival belongs to 1A01');
  assert.deepEqual(minutes('1A03'), [[623]], 'arrived 10:23; the row also departs as 5A04');
  assert.deepEqual(minutes('5A04'), [[635]]);
  assert.deepEqual(minutes('5A05'), [[983]], 'arrival 16:23 of the 5A05 leg');
  assert.deepEqual(minutes('2A06'), [[1000]], 'departure 16:40, merged from both coupled diagrams into one working');
  assert.equal(workingsFor('2A06').length, 1);
  assert.deepEqual(minutes('2A07'), [[1075]], 'arrives 17:55 from the leg that left North Berwick');
  assert.deepEqual(minutes('5A09'), [[1430]], 'arrives 23:50');
  assert.deepEqual(minutes('2A10'), [[1450]], '"1&" marks the next day: 00:10 is 1450 minutes after the service day began; the Clean row after it at the same place adds nothing');
  assert.deepEqual(minutes('1E01'), [[614]], 'an Attach row timed 10:14 is the arrival of the train that ran in');
  assert.deepEqual(minutes('1E02'), [[633]]);
  assert.deepEqual(minutes('1F01'), [[731]], 'a Detach row names the arriving train');
  assert.deepEqual(minutes('5F02'), [[758]]);
  assert.deepEqual(minutes('1B01'), [[723, 740], [723, 740]], 'the same headcode in two date ranges: two workings, each with its arrival and departure');
});

test('formations: one unit per coupled diagram in Vehicle-column order, each with its own class and vehicles', () => {
  const units = (headcode: string) => workingsFor(headcode)[0]!.units;
  assert.deepEqual(units('1A02'), [unit('ZZ103', '385', 3), unit('ZZ101', '385', 3)]);
  assert.deepEqual(units('2A06'), [unit('ZZ104', '385', 4), unit('ZZ101', '385', 3)]);
  assert.deepEqual(units('5A05'), [unit('ZZ101', '385', 3), unit('ZZ104', '385', 4)], 'the inbound leg keeps its own printed order');
  assert.deepEqual(units('1C01'), [unit('ZZ301', '43', 6)], 'no Vehicle Cover: the diagram on its own');
  assert.deepEqual(units('1C02'), [unit('ZZ302', '43', 7)]);
  assert.deepEqual(units('1D01'), [unit('ZZ401', '170', 3), unit('ZZ402', '158', 2)]);
  assert.deepEqual(units('1E01'), [unit('ZZ501', '170', 3)]);
  assert.deepEqual(units('1E02'), [unit('ZZ501', '170', 3), unit('ZZ502', '170', 3)]);
  assert.deepEqual(units('1F01'), [unit('ZZ501', '170', 3), unit('ZZ502', '170', 3)], 'the detach list "A, B" yields to the printed leg order');
  assert.deepEqual(units('5F02'), [unit('ZZ501', '170', 3)], 'after the detach the diagram runs alone');
  assert.deepEqual(units('5G01'), [unit('ZZ601', null, null)], 'a Q path names no class');
});

test('matchBooked emits units: single, 3+3, 3+4, HST 2+4 and 2+5, 2+2 158 and mixed classes', () => {
  // Tuesday 2026-11-10: SX (Mon-Fri) is running; Friday 2026-11-06 for FO; Sunday 2026-11-08 for Sun; Monday 2026-11-09 for MO.
  assert.deepEqual(matchBooked(table, '1E01', gmt(6, '10:14')), { operator: 'SR', class: '170', cars: 3, units: [{ class: '170', cars: 3 }], basis: 'booked diagram' },
    'a single unit also fills class and cars');
  assert.deepEqual(matchBooked(table, '1A02', gmt(10, '08:31')), evidence([{ class: '385', cars: 3 }, { class: '385', cars: 3 }]), '3+3: identical units, no order to assume');
  assert.deepEqual(matchBooked(table, '2A06', gmt(10, '16:41')), evidence([{ class: '385', cars: 4 }, { class: '385', cars: 3 }], { orderAssumed: true }),
    '3+4: Vehicle-column order, flagged assumed');
  assert.deepEqual(matchBooked(table, '5A05', gmt(10, '16:20')), evidence([{ class: '385', cars: 3 }, { class: '385', cars: 4 }], { orderAssumed: true }));
  assert.deepEqual(matchBooked(table, '1C01', gmt(8, '14:10')), { operator: 'SR', class: '43', cars: 6, units: [{ class: '43', cars: 6 }], basis: 'booked diagram' }, 'HST 2+4');
  assert.deepEqual(matchBooked(table, '1C02', gmt(8, '15:10')), { operator: 'SR', class: '43', cars: 7, units: [{ class: '43', cars: 7 }], basis: 'booked diagram' }, 'HST 2+5');
  assert.deepEqual(matchBooked(table, '1D01', gmt(9, '09:15')), evidence([{ class: '170', cars: 3 }, { class: '158', cars: 2 }], { orderAssumed: true }),
    'mixed classes are evidence now; the rows decide');
  assert.equal(matchBooked(table, '5G01', gmt(10, '04:05')), undefined, 'a unit of no known class is no evidence');
});

test('a 4+4, and a 158 pair, are two identical units each', () => {
  const four: FleetTable = { source: 's', builtAt: table.builtAt, workings: [
    { headcode: '1J01', days: 'SX', edinburghMinutes: [600], units: [unit('ZZ801', '385', 4), unit('ZZ802', '385', 4)] },
    { headcode: '1J02', days: 'SX', edinburghMinutes: [600], units: [unit('ZZ803', '158', 2), unit('ZZ804', '158', 2)] },
  ] };
  assert.deepEqual(matchBooked(four, '1J01', gmt(10, '10:00')), evidence([{ class: '385', cars: 4 }, { class: '385', cars: 4 }]));
  assert.deepEqual(matchBooked(four, '1J02', gmt(10, '10:00')), evidence([{ class: '158', cars: 2 }, { class: '158', cars: 2 }]));
});

test('date ranges select between two workings that share a headcode', () => {
  // Saturday 2026-09-26 is before the change on 28 September; Saturday 2026-10-03 is after it.
  const sep = Date.UTC(2026, 8, 26, 11, 15); // 12:15 BST
  const oct = Date.UTC(2026, 9, 3, 11, 15);
  assert.deepEqual(matchBooked(table, '1B01', sep), evidence([{ class: '158', cars: 2 }, { class: '158', cars: 2 }]));
  assert.deepEqual(matchBooked(table, '1B01', oct), { operator: 'SR', class: '158', cars: 2, units: [{ class: '158', cars: 2 }], basis: 'booked diagram' });
  assert.equal(matchBooked(table, '1B01', Date.UTC(2026, 10, 7, 12, 15))?.cars, 2, 'the later range has no end, so it still holds in November');
  assert.equal(matchBooked(table, '1B01', Date.UTC(2026, 10, 8, 12, 15)), undefined, 'Sunday: the working is Saturdays only');
});

test('weekday, window, midnight and the London clock', () => {
  const w = (over: Partial<BookedWorking>): BookedWorking => ({ headcode: '1K01', days: 'SX', edinburghMinutes: [600], units: [unit('ZZ901', '385', 3)], ...over });
  const at = (workings: BookedWorking[]): FleetTable => ({ source: 's', builtAt: table.builtAt, workings });
  const single = { operator: 'SR', class: '385', cars: 3, units: [{ class: '385', cars: 3 }], basis: 'booked diagram' };
  // Weekday: SX runs Monday to Friday. 2026-11-06 Friday, 07 Saturday, 08 Sunday.
  assert.deepEqual(matchBooked(at([w({})]), '1K01', gmt(6, '10:00')), single);
  assert.equal(matchBooked(at([w({})]), '1K01', gmt(7, '10:00')), undefined);
  assert.equal(matchBooked(at([w({})]), '1K01', gmt(8, '10:00')), undefined);
  assert.deepEqual(matchBooked(at([w({ days: 'Sun' })]), '1K01', gmt(8, '10:00')), single);
  // Window: 30 minutes by default, inclusive; the caller can widen it.
  assert.deepEqual(matchBooked(at([w({})]), '1K01', gmt(6, '10:30')), single);
  assert.equal(matchBooked(at([w({})]), '1K01', gmt(6, '10:31')), undefined);
  assert.deepEqual(matchBooked(at([w({})]), '1K01', gmt(6, '10:31'), 45), single);
  assert.deepEqual(matchBooked(at([w({})]), '1K01', gmt(6, '09:30')), single);
  assert.equal(matchBooked(at([w({})]), '1K01', gmt(6, '09:29')), undefined);
  // The headcode must be the TD description exactly; bad input is no evidence.
  assert.equal(matchBooked(at([w({})]), '1K02', gmt(6, '10:00')), undefined);
  assert.equal(matchBooked(at([w({})]), 'A001', gmt(6, '10:00')), undefined);
  assert.equal(matchBooked(at([w({})]), '1K01', Number.NaN), undefined);
  assert.equal(matchBooked(at([w({})]), '1K01', gmt(6, '10:00'), Number.NaN), undefined);
  // Europe/London: 10:00 BST on Monday 2026-06-15 is 09:00 UTC; the same UTC instant is not 10:00 in November.
  const bst = Date.UTC(2026, 5, 15, 9, 0);
  assert.deepEqual(matchBooked(at([w({})]), '1K01', bst), single);
  assert.equal(matchBooked(at([w({ edinburghMinutes: [660] })]), '1K01', bst + 3600_000 * 2), undefined, '11:00 UTC is 12:00 BST: outside the window of 11:00');
  // Midnight: a train booked at 00:10 after Friday's service day (1450) is seen at 00:08 on Saturday...
  const late = at([w({ edinburghMinutes: [1450] })]);
  assert.deepEqual(matchBooked(late, '1K01', gmt(7, '00:08')), single);
  assert.deepEqual(matchBooked(late, '1K01', gmt(6, '23:58')), single, '... and 23:58 on Friday, ten minutes early');
  assert.equal(matchBooked(late, '1K01', gmt(8, '00:08')), undefined, 'Saturday is not a service day of SX, so Sunday 00:08 is not 00:10 after one');
  // ... and the other way: booked 00:05 on a Saturday service day, seen at 23:58 on the Friday before.
  const early = at([w({ days: 'SO', edinburghMinutes: [5] })]);
  assert.deepEqual(matchBooked(early, '1K01', gmt(6, '23:58')), single);
  assert.deepEqual(matchBooked(early, '1K01', gmt(7, '00:03')), single);
  assert.equal(matchBooked(early, '1K01', gmt(6, '00:03')), undefined, 'Friday 00:03 is not near a Saturday 00:05');
});

test('nearest time wins; equal distance with different answers is a tie and gives nothing', () => {
  const at = (...ws: Partial<BookedWorking>[]): FleetTable => ({ source: 's', builtAt: table.builtAt, workings: ws.map(p => ({
    headcode: '1L01', days: 'SX', edinburghMinutes: [480], units: [unit('ZZ901', '385', 3)], ...p })) });
  const three = { class: '385', cars: 3 }, four = { class: '385', cars: 4 };
  const pair = at({ edinburghMinutes: [480] }, { edinburghMinutes: [520], units: [unit('ZZ902', '385', 4)] });
  assert.deepEqual(matchBooked(pair, '1L01', gmt(10, '08:19'))?.units, [three]);
  assert.deepEqual(matchBooked(pair, '1L01', gmt(10, '08:28'))?.units, [four], '08:40 is nearer than 08:00');
  assert.equal(matchBooked(pair, '1L01', gmt(10, '08:20')), undefined, 'exactly between: different answers tie');
  assert.equal(matchBooked(at({}, { units: [unit('ZZ902', '385', 4)] }), '1L01', gmt(10, '08:00')), undefined, 'same time, different answers');
  assert.deepEqual(matchBooked(at({}, { days: 'MO' }), '1L01', gmt(9, '08:00'))?.units, [three], 'the same answer twice is not a tie');
  assert.equal(matchBooked(at({ edinburghMinutes: [480] }, { edinburghMinutes: [480.5], units: [unit('ZZ902', '385', 4)] }), '1L01', gmt(10, '08:00')), undefined, 'half a minute apart is still a tie');
  assert.deepEqual(matchBooked(at({ edinburghMinutes: [480] }, { edinburghMinutes: [482], units: [unit('ZZ902', '385', 4)] }), '1L01', gmt(10, '08:00'))?.units, [three]);
  // The same units in another order are one answer.
  const swapped = at({ units: [unit('ZZ901', '385', 3), unit('ZZ902', '385', 4)] }, { units: [unit('ZZ902', '385', 4), unit('ZZ901', '385', 3)] });
  assert.deepEqual(matchBooked(swapped, '1L01', gmt(10, '08:00'))?.units, [three, four]);
});

test('validateFleetTable is strict about shape', () => {
  const good = (): Record<string, unknown> => structuredClone({ source: 'synthetic', builtAt: '2026-11-10T09:00:00.000Z', workings: [
    { headcode: '1A02', days: 'SX', from: '2026-09-28', until: '2026-10-24', edinburghMinutes: [511.5], units: [{ diagram: 'ZZ103', class: '385', cars: 3 }, { diagram: 'ZZ601', class: null, cars: null }] },
  ] });
  assert.doesNotThrow(() => validateFleetTable(good()));
  assert.equal(validateFleetTable(table), table);
  const bad: [string, (t: Record<string, any>) => void][] = [
    ['extra table key', t => { t.extra = 1; }],
    ['missing source', t => { delete t.source; }],
    ['source not text', t => { t.source = 7; }],
    ['bad builtAt', t => { t.builtAt = 'yesterday'; }],
    ['workings not an array', t => { t.workings = {}; }],
    ['working not an object', t => { t.workings = [3]; }],
    ['working extra key', t => { t.workings[0].note = 'x'; }],
    ['old class key', t => { t.workings[0].class = '385'; }],
    ['lower-case headcode', t => { t.workings[0].headcode = '1a02'; }],
    ['six-character headcode', t => { t.workings[0].headcode = '1A02LA'; }],
    ['unknown days', t => { t.workings[0].days = 'XQ'; }],
    ['bad from date', t => { t.workings[0].from = '2026-02-30'; }],
    ['bad until text', t => { t.workings[0].until = 'soon'; }],
    ['from after until', t => { t.workings[0].from = '2026-11-01'; }],
    ['no minutes', t => { t.workings[0].edinburghMinutes = []; }],
    ['minutes not numbers', t => { t.workings[0].edinburghMinutes = ['511']; }],
    ['negative minutes', t => { t.workings[0].edinburghMinutes = [-1]; }],
    ['minutes beyond two days', t => { t.workings[0].edinburghMinutes = [2880]; }],
    ['no units', t => { t.workings[0].units = []; }],
    ['unit not an object', t => { t.workings[0].units = [1]; }],
    ['unit extra key', t => { t.workings[0].units[0].extra = 1; }],
    ['bad diagram id', t => { t.workings[0].units[0].diagram = 'zz103'; }],
    ['bad class', t => { t.workings[0].units[0].class = '385 EMU'; }],
    ['fractional cars', t => { t.workings[0].units[0].cars = 2.5; }],
    ['too many cars', t => { t.workings[0].units[0].cars = 40; }],
    ['class without cars', t => { t.workings[0].units[0].cars = null; }],
    ['cars without class', t => { t.workings[0].units[1].cars = 3; }],
  ];
  for (const [name, mutate] of bad) {
    const t = good();
    mutate(t);
    assert.throws(() => validateFleetTable(t), /fleet table/, name);
  }
  for (const value of [null, undefined, 3, 'x', []]) assert.throws(() => validateFleetTable(value), /fleet table/);
});

test('sources combine: the first with an answer wins, so a later feed can lead the booked table', () => {
  const booked = bookedSource(table);
  const actual: (d: string, t: number) => EdinburghServiceEvidence | undefined = (d) => d === '1A02' ? { operator: 'SR', units: [{ class: '385', cars: 3 }], basis: 'actual allocation' } : undefined;
  const lead = firstEvidence(actual, booked);
  assert.equal(lead('1A02', gmt(10, '08:31'))?.basis, 'actual allocation');
  assert.equal(lead('2A06', gmt(10, '16:41'))?.basis, 'booked diagram', 'falls through to the booked table');
  assert.equal(lead('9Z99', gmt(10, '16:41')), undefined);
  assert.equal(firstEvidence(undefined, booked)('2A06', gmt(10, '16:41'))?.basis, 'booked diagram', 'an absent source is skipped');
  assert.equal(firstEvidence()('2A06', 0), undefined);
});
