import assert from 'node:assert/strict';
import test from 'node:test';

const start = Date.UTC(2035, 0, 1, 12);
const movements = Array.from({ length: 4 }, (_, i) => ({
  trainId: `00${i}Z90SYN`, headcode: `${i}Z90`, actualMs: start + i * 600_000, eventType: 'ARRIVAL', platform: '3',
}));
const step = (movement, area, from, to, offset) => ({ t: movement.actualMs + offset,
  e: { kind: 'step', area, descr: movement.headcode, from, to, time: movement.actualMs + offset } });

test('recorded TD steps identify repeated Perth platform and approach evidence, withholding ambiguous episodes', async () => {
  const { correlatePerth } = await import('../perth-discovery.mjs');
  const rows = movements.map(m => step(m, 'ZZ', 'XQ01', 'XQ02', -10_000));
  const ambiguous = step(movements[3], 'ZZ', 'XQ03', 'XQ04', -9000);
  const result = correlatePerth(movements, { ZZ: [...rows, rows[0], ambiguous], ZX: [step(movements[0], 'ZX', 'XQ05', 'XQ06', 12_000)] });
  assert.deepEqual(result.recommendedAreas, ['ZZ']);
  assert.equal(result.areas.ZZ.ambiguous, 1);
  assert.deepEqual(result.areas.ZZ.berths.map(({ berth, confidence, platform, role }) => ({ berth, confidence, platform, role })), [
    { berth: 'XQ02', confidence: 'high', platform: '3', role: 'station' },
    { berth: 'XQ01', confidence: 'high', platform: '3', role: 'approach' },
  ]);
  assert.equal(result.areas.ZX.confidence, 'low');
});

test('area recommendations require independent evidence when the same services appear in two areas', async () => {
  const { correlatePerth } = await import('../perth-discovery.mjs');
  const duplicated = correlatePerth(movements, {
    ZZ: movements.map(m => step(m, 'ZZ', 'XQ01', 'XQ02', -10_000)),
    ZX: movements.map(m => step(m, 'ZX', 'XQ05', 'XQ06', -12_000)),
  });
  assert.deepEqual(duplicated.recommendedAreas, []);
  assert.deepEqual(duplicated.reviewAreas, ['ZX', 'ZZ']);
  const departures = movements.map(m => ({ ...m, actualMs: m.actualMs + 86_400_000, eventType: 'DEPARTURE' }));
  const separate = correlatePerth([...movements, ...departures], {
    ZZ: movements.map(m => step(m, 'ZZ', 'XQ01', 'XQ02', -10_000)),
    ZX: departures.map(m => step(m, 'ZX', 'XQ05', 'XQ06', 12_000)),
  });
  assert.deepEqual(separate.recommendedAreas, ['ZX', 'ZZ']);
  assert.deepEqual(separate.areas.ZX.berths.map(({ berth, role }) => [berth, role]), [['XQ05', 'station'], ['XQ06', 'approach']]);
});

test('Perth anchors place a high-confidence unique platform, withholding the approach until track and direction are reviewed', async () => {
  const { buildPerthAnchors } = await import('../perth-anchors.mjs');
  const geometry = { attribution: 'synthetic', origin: { lat: 0, lon: 0 },
    rails: [{ id: 'synthetic/rail', tags: { railway: 'rail' }, path: [[0, -400], [0, 0], [0, 400]] }],
    platforms: [{ id: 'synthetic/platform', ref: '3', tags: {}, path: [[1, -250], [4, -250], [4, -90], [1, -90]] }] };
  const berths = [{ berth: 'XQ02', confidence: 'high', platform: '3', role: 'station', support: 3, platformSupport: { '3': 3 } },
    { berth: 'XQ01', confidence: 'high', platform: '3', role: 'approach', support: 3 }];

  const { map } = buildPerthAnchors(geometry, 'ZZ', berths, { provisionalHeading: true });
  assert.equal(map.anchors.length, 1);
  assert.equal(map.anchors[0].point[0], 0);
  assert.ok(Math.abs(map.anchors[0].point[1] + 170) < 1e-9);
  assert.equal(map.anchors[0].platform, undefined);
  assert.deepEqual(map.unmapped.map(b => b.berth), ['XQ01']);
  const placements = [{ berth: 'XQ01', from: 1, to: 2, t: .25, errorM: 25, evidence: 'synthetic direction review' }];
  const reviewed = buildPerthAnchors(geometry, 'ZZ', berths, { placements });
  assert.deepEqual(reviewed.map.anchors.map(a => [a.berth, a.point]), [['XQ01', [0, -300]]]);
  assert.throws(() => buildPerthAnchors(geometry, 'ZZ', berths, { placements: [{ ...placements[0], to: 3 }] }), /invalid reviewed placement/);
});
