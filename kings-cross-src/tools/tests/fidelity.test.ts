import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test, { after, before } from 'node:test';
import { fileURLToPath } from 'node:url';
import { unproject } from '../../core/geo.ts';
import type { KxData } from '../../core/osm.ts';

const PACKAGE = fileURLToPath(new URL('../..', import.meta.url));
const SCRATCH = process.env.ROUND36_FIDELITY_SCRATCH
  ?? path.resolve(PACKAGE, '../.scratch/fidelity-tests');
const EXPECTED_LENGTHS: Record<string, number> = {
  '0': 305, '1': 304, '2': 285, '3': 288, '4': 290, '5': 278,
  '6': 289, '7': 289, '8': 291, '9': 176, '10': 176,
};
const SECTIONAL_APPENDIX_URL = 'https://sacuksprodnrdigital0001.blob.core.windows.net/sectional-appendix/Sectional%20Appendix%20full%20PDFs%20September%2026/London%20North%20Eastern%20%28NCS%29%20Sectional%20Appendix%20September%202026.pdf#page=110';

let fixturePath = '';
let report: any;
let humanOutput = '';

before(async () => {
  await mkdir(SCRATCH, { recursive: true });
  fixturePath = path.join(SCRATCH, `fidelity-synthetic-${process.pid}.json`);
  const data = JSON.parse(readFileSync(path.join(PACKAGE, 'web/src/data/kx-track.json'), 'utf8')) as KxData;
  // This fixture inverse-projects rounded, committed public OSM-derived data. It exercises the
  // CLI only; it is synthetic and is not an independent raw OSM reference.
  const locations = new Map(data.nodes.map(([id, x, z]) => [id, unproject(x, z, data.origin)]));
  const elements = [
    ...data.nodes.map(([id, x, z]) => ({ type: 'node', id, ...unproject(x, z, data.origin) })),
    ...data.rails.map(rail => ({
      type: 'way', id: rail.id, nodes: rail.nodes,
      geometry: rail.nodes.map(id => locations.get(id)).filter(Boolean),
    })),
    ...data.platforms.map(platform => ({
      type: 'way', id: platform.id,
      tags: { railway: 'platform', ...(platform.ref === undefined ? {} : { ref: platform.ref }) },
      geometry: platform.pts.map(([x, z]) => unproject(x, z, data.origin)),
    })),
  ];
  await writeFile(fixturePath, JSON.stringify({ elements }));
  const result = spawnSync(process.execPath, ['tools/fidelity.ts', '--raw', fixturePath, '--json'], {
    cwd: PACKAGE, encoding: 'utf8', timeout: 20_000, maxBuffer: 8 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  assert.equal(result.error, undefined, result.error?.message ?? 'fidelity CLI spawn failed');
  assert.equal(result.status, 0, `fidelity CLI failed: ${result.stderr}\n${result.stdout}`);
  report = JSON.parse(result.stdout);
  const human = spawnSync(process.execPath, ['tools/fidelity.ts', '--raw', fixturePath], {
    cwd: PACKAGE, encoding: 'utf8', timeout: 20_000, maxBuffer: 8 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  assert.equal(human.error, undefined, human.error?.message ?? 'human fidelity CLI spawn failed');
  assert.equal(human.status, 0, `human fidelity CLI failed: ${human.stderr}\n${human.stdout}`);
  humanOutput = human.stdout;
});

after(async () => {
  if (fixturePath) await rm(fixturePath, { force: true });
});

test('fidelity CLI reports P0–P10 operational lengths with the current cited source', () => {
  const byRef = new Map(report.platforms.map((row: any) => [row.ref, row]));
  assert.deepEqual(Object.fromEntries([...byRef].map(([ref, row]: any) => [ref, row.published?.m])), EXPECTED_LENGTHS);
  assert.match(report.publishedLengthSource.citation, /Network Rail LNE \(NCS\) Sectional Appendix, September 2026/);
  assert.match(report.publishedLengthSource.citation, /PDF p\.110 \/ printed p\.44/);
  assert.equal(report.publishedLengthSource.url, SECTIONAL_APPENDIX_URL);
  assert.match(report.publishedLengthSource.basis, /operational lengths/i);
  assert.doesNotMatch(JSON.stringify(report), /weak|blog citing Google/i);
});

test('fidelity CLI separates compact OSM, synthetic raw input, and actual drawn mesh lengths', () => {
  const p9 = report.platforms.find((row: any) => row.ref === '9');
  assert.ok(Math.abs(p9.compactOsmM - 162.476211) < 0.001);
  assert.ok(Math.abs(p9.rawM - 162.476211) < 1);
  assert.ok(Math.abs(p9.drawnMeshM - 176.682594) < 0.001);
  assert.equal(p9.modelM, p9.compactOsmM, 'legacy modelM remains an alias for compact OSM length');
  assert.match(report.platformMeasurementBasis.compactOsmM, /compact OSM/i);
  assert.match(report.platformMeasurementBasis.rawM, /latitude and longitude/i);
  assert.match(report.platformMeasurementBasis.drawnMeshM, /axis01-evidence/i);
  assert.match(report.gaugeM.method, /arithmetic.*twinRails/i);
  assert.match(report.axis01Evidence.method.gauge, /rays.*actual merged rail mesh/i);
  assert.ok(report.axis01Evidence.flags.some((flag: any) => flag.code === 'platform-published-tolerance' && /Platform 0/.test(flag.detail)));
});

test('fidelity CLI reports the P9 cap as a separate documented drawing inference', () => {
  assert.ok(Array.isArray(report.drawingInferences), 'report exposes documented drawing inferences');
  assert.equal(report.drawingInferences?.length, 1);
  const p9 = report.drawingInferences?.[0];
  assert.equal(p9.ref, '9');
  assert.equal(p9.independentSurvey, false);
  assert.ok(Math.abs(p9.compactOsmM - 162.476211) < 0.001);
  assert.ok(Math.abs(p9.drawnMeshM - 176.682594) < 0.001);
  assert.match(p9.inference, /north cap/i);
  assert.match(p9.source, /Network Rail LNE \(NCS\) Sectional Appendix/);
  assert.match(p9.limitation, /not a survey/i);
});

test('fidelity CLI distinguishes the partial concourse arc fit from overall roof evidence', () => {
  assert.ok(Math.abs(report.concourse.partialOsmArcFitRadiusM - 61.6) < 1);
  assert.ok(Math.abs(report.concourse.drawnNorthSouthM - 137.278699) < 0.001);
  assert.equal(report.concourse.publishedOverallRoofM, 138);
  assert.equal(report.concourse.withinPublishedTolerance, true);
  assert.match(report.concourse.drawnMeshSource, /axis01-evidence/i);
});

test('fidelity unresolved issues retain real survey, definition, gradient, and canal limits only', () => {
  const unresolved = report.unresolvedOsmIssues.join('\n');
  assert.match(unresolved, /physical.*operational|operational.*physical/i);
  assert.match(unresolved, /survey/i);
  assert.match(unresolved, /gradient/i);
  assert.match(unresolved, /canal/i);
  assert.doesNotMatch(unresolved, /276/);
  assert.doesNotMatch(unresolved, /74\s*m.*radius|radius.*74\s*m/i);
  assert.doesNotMatch(unresolved, /weak published|model differs from published/i);
  assert.match(humanOutput, /OK: compact\/raw OSM platform and track comparisons, arithmetic gauge and shed dimensions are inside their tolerances/);
  assert.match(humanOutput, /AXIS01 ACTUAL-MESH EVIDENCE FLAGS \(\d+\); separate from the exit status/);
  assert.match(humanOutput, /GAUGE \(twinRails arithmetic, not mesh rays\)/);
  assert.doesNotMatch(humanOutput, /OK: every check is inside tolerance/);
});
