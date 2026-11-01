import './nice.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PLAN_PATHS, TYPE_IDS, createSubstationPlan, validateSubstationPlan, validateYardParity, parityCanonical, segmentPolygonDistance, pointInPolygon, transformFootprint } from '../tools/substation_plan.mjs';

const mutation = process.env.SUBSTATION_TEST_MUTATION || '';
const clone = (v) => JSON.parse(JSON.stringify(v));
const load = (v) => JSON.parse(readFileSync(PLAN_PATHS[v], 'utf8'));
const catalogPath = resolve(dirname(fileURLToPath(import.meta.url)), '../tools/blender/substation.catalog.json');
const catalogue = existsSync(catalogPath) ? JSON.parse(readFileSync(catalogPath, 'utf8')) : null;
const errors = (r) => r.failures.join('\n');

test('Y01 both checked-in plans pass full metre and placement validation', () => {
  for (const variant of ['uk', 'co']) {
    const p = load(variant); if (mutation === 'Y01') p.units = 'centimetres';
    const r = validateSubstationPlan(p, { catalogue });
    assert.equal(r.ok, true, errors(r)); assert.equal(r.typeCount, 53); assert.ok(r.equipmentCount > 300);
    assert.equal(p.variant, variant); assert.deepEqual(p.origin, [0, 0, 0]); assert.deepEqual(p.compound.size, [55, 40]);
  }
});

test('Y02 complete equipment inventory includes twins and twelve indoor panels', () => {
  const p = load('uk'); if (mutation === 'Y02') p.equipment = p.equipment.filter((e) => e.id !== 'grid-2');
  const counts = {};
  for (const item of p.equipment) counts[item.type] = (counts[item.type] || 0) + 1;
  assert.equal(counts.grid_transformer, 2); assert.equal(counts.distribution_transformer, 2); assert.equal(counts.switchboard_panel, 12);
  assert.deepEqual(Object.keys(counts).sort(), [...TYPE_IDS].sort());
  const panels = p.equipment.filter((e) => e.type === 'switchboard_panel');
  assert.deepEqual(panels.map((e) => e.panelNumber), Array.from({ length: 12 }, (_, i) => i + 1));
  assert.ok(panels.every((e) => e.indoor && e.assembly === 'control-building'));
  const width = p.equipmentTypes.switchboard_panel.variantBinding.envelope[0];
  for (let i = 1; i < panels.length; i++) assert.ok(Math.abs(panels[i].position[0] - panels[i - 1].position[0] - width) < 1e-9, 'twelve cubicles must form a continuous board');
  for (const item of p.equipment) {
    if (item.elevated || p.equipmentTypes[item.type].traversable) continue;
    assert.equal(item.position[1], item.type === 'grid_transformer' ? 0.12 : 0, `${item.id}: base must sit on the bund gravel or ground`);
  }
  const bus = p.equipment.find((e) => e.id === 'busbar-tube');
  const supports = p.equipment.filter((e) => /^bus-support-/.test(e.id));
  assert.equal(supports.length, 2);
  for (const support of supports) {
    assert.equal(support.type, 'post_insulator');
    assert.equal(support.position[2], bus.position[2]);
    assert.ok(Math.abs(support.position[0] - bus.position[0]) < p.equipmentTypes.busbar_tube.variantBinding.envelope[0] / 2);
    assert.ok(Math.abs(bus.position[1] + 0.003076923 - support.position[1] - p.equipmentTypes.post_insulator.variantBinding.envelope[1]) < 1e-7, 'tube underside must touch each dedicated support');
  }
  assert.ok(Math.abs(p.equipment.find((e) => e.id === 'busbar-wire-segment').position[1] + 1 - 5.827102661) < 1e-9, 'wire drop must touch the gantry string terminal');
});

test('Y03 parity permits explicit variant fields and rejects equipment drift', () => {
  const uk = load('uk'), co = load('co');
  if (mutation === 'Y03') co.equipment[0].position[0] += 1;
  assert.equal(validateYardParity(uk, co).ok, true);
  assert.deepEqual(parityCanonical(uk), parityCanonical(co));
  const moved = clone(co); moved.equipment[1].rotationY = 0.3;
  assert.equal(validateYardParity(uk, moved).ok, false);
  const missing = clone(co); missing.equipment.pop();
  assert.equal(validateYardParity(uk, missing).ok, false);
  assert.notDeepEqual(uk.variantProfile.voltageKV, co.variantProfile.voltageKV);
});

test('Y04 named future anchors and empty bilingual inspection slots are complete', () => {
  const p = load('co'); if (mutation === 'Y04') delete p.equipmentTypes.chair.anchors.seat;
  for (const type of Object.values(p.equipmentTypes)) {
    assert.deepEqual(type.inspectionNote, { es: '', en: '' });
    assert.equal(type.anchors.standing.name, 'inspection_stand');
    for (const slot of ['hum100Hz', 'lamps', 'doorHinges', 'standing', 'seat']) assert.ok(Object.hasOwn(type.anchors, slot));
  }
  assert.equal(p.equipmentTypes.grid_transformer.anchors.hum100Hz.frequencyHz, 100);
  assert.equal(p.equipmentTypes.distribution_transformer.anchors.hum100Hz.frequencyHz, 100);
  assert.equal(p.equipmentTypes.chair.anchors.seat.name, 'seat');
  assert.equal(p.audio.humFrequencyHz, 100); assert.equal(p.variantProfile.gridFrequencyHz, 60);
  assert.match(p.audio.note, /120 Hz/);
  const wrong = clone(p); wrong.equipmentTypes.grid_transformer.anchors.hum100Hz.frequencyHz = 120;
  assert.match(errors(validateSubstationPlan(wrong)), /hum anchor must specify 100 Hz/);
  wrong.equipmentTypes.chair.inspectionNote.es = 'Pending';
  assert.match(errors(validateSubstationPlan(wrong)), /inspection-note slots must remain empty/);
});

test('Y05 complete route segments clear all conservative keep-outs and body radius', () => {
  const p = load('uk'); if (mutation === 'Y05') p.visitorRoute.points[3] = [-12, 0, -1];
  const result = validateSubstationPlan(p, { catalogue }); assert.equal(result.ok, true, errors(result));
  const cut = clone(p); cut.visitorRoute.points = [[-17, 0, 20], [-12, 0, -1], [16, 0, 17.5]];
  assert.equal(validateSubstationPlan(cut).ok, false);
  assert.match(errors(validateSubstationPlan(cut)), /route segment.*grid-1/);
  const pole = clone(p); pole.equipment.find((e) => e.id === 'station-service').position = [-23.5, 0, 8];
  assert.match(errors(validateSubstationPlan(pole)), /route segment.*station-service/);
  const hidden = clone(p); const tx = hidden.equipment.find((e) => e.id === 'grid-1'); tx.elevated = true; tx.position = [-23.5, 10, 8];
  assert.match(errors(validateSubstationPlan(hidden)), /cannot bypass ground placement/);
  const stop = clone(p); stop.visitorRoute.stops[0].position = [-12, 0, -1];
  assert.match(errors(validateSubstationPlan(stop)), /inspection stop leaves checked visitor route/);
});

test('Y06 nav polygons enclose real envelopes and electrical exclusion margins', () => {
  const p = load('co');
  if (mutation === 'Y06') p.equipmentTypes.grid_transformer.navKeepOut = [[-0.1, -0.1], [0.1, -0.1], [0.1, 0.1], [-0.1, 0.1]];
  assert.equal(validateSubstationPlan(p).ok, true, errors(validateSubstationPlan(p)));
  const tiny = clone(p); tiny.equipmentTypes.distribution_transformer.navKeepOut = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  assert.match(errors(validateSubstationPlan(tiny)), /keep-out does not contain equipment/);
  const unsafe = clone(p); unsafe.equipmentTypes.grid_transformer.liveParts.exclusionMarginM = 0;
  assert.match(errors(validateSubstationPlan(unsafe)), /live-parts margin reduced/);
  const bowtie = clone(p); bowtie.equipmentTypes.desk.navKeepOut = [[-1, -1], [1, 1], [-1, 1], [1, -1]];
  assert.match(errors(validateSubstationPlan(bowtie)), /invalid keep-out polygon/);
});

test('Y07 route enters through the open gate with covered trenches and a building footprint', () => {
  const p = load('uk'); if (mutation === 'Y07') p.visitorRoute.points[0] = [0, 0, 20];
  assert.deepEqual(p.visitorRoute.points[0], p.compound.gate.centre);
  assert.equal(p.visitorRoute.gateMustBeOpen, true); assert.equal(p.compound.gate.widthM, 4);
  assert.ok(p.trenches.every((t) => t.covered && t.polyline.length >= 2));
  assert.equal(pointInPolygon([16, 12], p.controlBuilding.footprint), true);
  const windows = p.equipment.filter((e) => e.type === 'window').map((e) => e.position).sort((a, b) => a[0] - b[0]);
  assert.deepEqual(windows, [[12.5, 1.2, 15.52], [19.5, 1.2, 15.52]], 'window kit pieces must fill both shell apertures');
  assert.deepEqual(p.equipment.find((e) => e.id === 'building-louvre').position, [16, 2.8, 15.52], 'louvre belongs above the entry door');
  assert.equal(p.equipment.find((e) => e.id === 'chair').rotationY, 0, 'chair faces the desk in the +Z direction');
  const bad = clone(p); bad.trenches[0].covered = false;
  assert.match(errors(validateSubstationPlan(bad)), /covered cable-trench/);
  bad.compound.gate.widthM = 0.5;
  assert.match(errors(validateSubstationPlan(bad)), /gate location\/width/);
});

test('Y08 malformed schema, identity, bindings and placements are rejected', () => {
  const p = load('uk'); p.schemaVersion = mutation === 'Y08' ? 1 : 2;
  assert.match(errors(validateSubstationPlan(p)), /schema, metre units/);
  for (const mutate of [
    (x) => { x.variantProfile.voltageKV = [115, 34.5, 13.2]; },
    (x) => { x.equipment[1].id = x.equipment[0].id; },
    (x) => { x.equipment[0].position[1] = NaN; },
    (x) => { x.equipmentTypes.gate.variantBinding.asset = 'substation_co_gate'; },
    (x) => { x.equipmentTypes.grid_transformer.variantBinding.envelope = [-1, 1, 1]; },
    (x) => { x.equipment[0].scale = [0.5, 0.5, 0.5]; },
  ]) { const broken = load('uk'); mutate(broken); assert.equal(validateSubstationPlan(broken).ok, false); }
});

test('Y09 exact segment polygon distance catches edge crossings and near misses', () => {
  const poly = mutation === 'Y09' ? [[10, 10], [11, 10], [11, 11], [10, 11]] : [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  assert.equal(segmentPolygonDistance([-3, 0], [3, 0], poly), 0, 'endpoints outside but edge crosses');
  assert.equal(segmentPolygonDistance([-3, 2], [3, 2], poly), 1);
  assert.equal(segmentPolygonDistance([0, 0], [0, 0], poly), 0);
  assert.equal(segmentPolygonDistance([-3, 1], [3, 1], poly), 0, 'edge contact is blocked');
  const transformed = transformFootprint([[-1, -2], [1, -2], [1, 2], [-1, 2]], { position: [5, 0, 6], rotationY: Math.PI / 2 });
  for (let i = 0; i < 4; i++) {
    assert.ok(Math.abs(transformed[i][0] - [[3, 7], [3, 5], [7, 5], [7, 7]][i][0]) < 1e-8);
    assert.ok(Math.abs(transformed[i][1] - [[3, 7], [3, 5], [7, 5], [7, 7]][i][1]) < 1e-8);
  }
});

test('Y10 plan regeneration is deterministic from the catalogue across text line endings', () => {
  for (const variant of ['uk', 'co']) {
    const generated = createSubstationPlan(variant, { catalogue }); if (mutation === 'Y10') generated.equipment[0].position[0] += 1;
    assert.ok(JSON.stringify(generated) === JSON.stringify(load(variant)), `${variant}: generated plan differs from checked-in data`);
    const crlf = JSON.stringify(generated, null, 2).replaceAll('\n', '\r\n');
    assert.deepEqual(JSON.parse(crlf), generated);
  }
  assert.throws(() => createSubstationPlan('gb'), /variant must be uk or co/);
});

test('Y11 line supports, catenary recipes and external anchors resolve for both yards', () => {
  for (const v of ['uk', 'co']) {
    const p = load(v); if (mutation === 'Y11') p.spans[0].from = 'missing-tower';
    assert.equal(validateSubstationPlan(p).ok, true, errors(validateSubstationPlan(p)));
    assert.equal(p.spans[0].circuits, 2); assert.equal(p.spans[0].phasesPerCircuit, 3);
    assert.ok(p.equipment.filter((e) => /tower_|pole_/.test(e.type)).every((e) => e.external));
    const broken = clone(p); broken.variantProfile.lineRecipes.mv.sagM = -1;
    assert.match(errors(validateSubstationPlan(broken)), /invalid catenary recipe/);
  }
});
