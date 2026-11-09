import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildWaverleyAnchors, decodeWaverleyAnchorScene, waverleyTrackData, waverleyPlatformGeometry } from '../waverley-anchors.ts';
import type { WaverleyAnchorScene } from '../waverley-anchors.ts';
import type { SmartRow } from '../berths.ts';
import { buildGraph, components } from '../graph.ts';
import { createMotion } from '../motion.ts';

// Invented coordinates, paths, platform and berth identities; no operational fixtures.
function scene(): WaverleyAnchorScene {
  return { origin: { lat: 0, lon: 0 }, attribution: 'Synthetic',
    rails: [{ id: 'synthetic/track', path: [[0,-1004],[200,-1004],[400,-1004],[800,-1004],[1000,-1004],[1400,-1004],[1600,-1004],[2100,-1004]], tags: { railway: 'rail' } }],
    platforms: [1,2,3].map((n) => ({ id: `synthetic/platform${n}`, ref: String(n), path: [[n*600-400,-1001],[n*600-200,-1001],[n*600-200,-999],[n*600-400,-999]], tags: { railway: 'platform' } })) };
}
const row = (platform: string, berth: string, event = 'A'): SmartRow => ({ TD: 'EB', STANME: 'EDINBURGH', EVENT: event, PLATFORM: platform, FROMBERTH: event === 'B' || event === 'D' ? berth : 'UPST', TOBERTH: event === 'A' || event === 'C' ? berth : 'NEXT', BERTHOFFSET: '99999' });
const rows = () => [row('1','QQ01'),row('2','QQ02'),row('3','QQ03')];

test('Waverley decodes public packed and unpacked geometry and rejects truncated paths', () => {
  const d = scene(); assert.deepEqual(decodeWaverleyAnchorScene(d), d);
  const packed = { ...d, format: 'waverley-varint-v1', q: 0.1, platforms: [], rails: [{ id: 'invented', tags: {}, path: btoa(String.fromCharCode(0,0,20,0)) }] };
  assert.deepEqual(decodeWaverleyAnchorScene(packed).rails[0]!.path, [[0,0],[1,0]]);
  assert.throws(() => decodeWaverleyAnchorScene({ ...packed, q: 1 }), /Unsupported/);
  assert.throws(() => decodeWaverleyAnchorScene({ ...packed, rails: [{ ...packed.rails[0], path: btoa(String.fromCharCode(128)) }] }), /Truncated/);
});

test('Waverley coordinate graph joins only identical vertices on the same layer deterministically', () => {
  const d = scene(); d.platforms = [];
  d.rails = [
    { id: 'a', path: [[0,0],[10,0]], tags: {} }, { id: 'b', path: [[10,0],[20,0]], tags: {} },
    { id: 'c', path: [[10.1,0],[30,0]], tags: {} }, { id: 'd', path: [[5,-5],[5,5]], tags: {} },
    { id: 'e', path: [[10,0],[40,0]], tags: { layer: '1' } },
  ];
  const data = waverleyTrackData(d), graph = buildGraph(data);
  assert.equal(components(graph).length, 4);
  assert.equal(data.nodes.filter(([,x,z]) => x === 10 && z === 0).length, 2);
  assert.equal(data.nodes.some(([,x,z]) => x === 5 && z === 0), false);
  assert.deepEqual(waverleyTrackData({ ...d, rails: [...d.rails].reverse() }), data);
});

test('Waverley default withholds unreviewed heading and preview uses ordinary anchors with full uncertainty', () => {
  const d = scene(); const geometry = waverleyPlatformGeometry(d);
  assert.deepEqual(geometry.map(g => g.candidates.length), [1,1,1]);
  assert.ok(geometry.every(g => g.candidates[0]!.topology === 'through-or-unresolved'));
  const conservative = buildWaverleyAnchors(d, rows());
  assert.equal(conservative.anchors.length, 0); assert.match(conservative.unmapped.find(b => b.berth === 'QQ01')!.detail, /heading/);
  const preview = buildWaverleyAnchors(d, [row('1','QQ01','A'),row('2','QQ02','B'),row('3','QQ03','C'),row('1','QQ04','D')], [], { allowProvisionalHeading: true });
  assert.deepEqual(preview.anchors.map(a => a.berth), ['QQ01','QQ02','QQ03','QQ04']);
  assert.deepEqual(preview.provisionalHeadings, ['QQ01','QQ02','QQ03','QQ04']);
  for (const a of preview.anchors) { assert.equal(a.kind, 'smart'); assert.equal(a.platform, undefined); assert.ok(a.errorM >= 200); assert.match(a.evidence, /ASSUMED provisional heading/); assert.match(a.evidence, /no proven buffer/); }
  assert.deepEqual(preview.platformAssociations.map(a => a.selectedEndpoint), ['TOBERTH','FROMBERTH','TOBERTH','FROMBERTH']);
});

test('Waverley preserves competing historical associations and split east/west faces despite observed presence', () => {
  const d = scene();
  const conflict = buildWaverleyAnchors(d, [row('1','REUS'),row('2','REUS','C')], [{ t: 0, e: { kind: 'snapshot', area: 'EB', berths: { REUS: 'SYN1' } } }], { allowProvisionalHeading: true });
  assert.equal(conflict.anchors.length, 0); assert.equal(conflict.unmapped.find(b => b.berth === 'REUS')?.reason, 'conflict');
  assert.deepEqual(conflict.platformAssociations.filter(a => a.berth === 'REUS').map(a => a.platform), ['1','2']);
  d.platforms[0]!.ref = '8e'; d.platforms[1]!.ref = '8w';
  const split = buildWaverleyAnchors(d, [row('8','SPLT')], [], { allowProvisionalHeading: true });
  assert.equal(split.anchors.length, 0); assert.match(split.unmapped.find(b => b.berth === 'SPLT')!.detail, /8e, 8w/);
});

test('Waverley rejects ambiguous adjacent tracks and never manufactures approach or outside-area anchors', () => {
  const d = scene();
  d.rails.push({ ...d.rails[0]!, id: 'synthetic/other-track', path: d.rails[0]!.path.map(([x]) => [x,-996]) });
  assert.equal(waverleyPlatformGeometry(d)[0]!.candidates.length, 2);
  const map = buildWaverleyAnchors(d, [row('1','QQ01'), { ...row('2','FORE'), TD: 'WH' }, { ...row('3','WRNG'), STANME: 'OTHER' }], [{ t: 0, e: { kind: 'step', area: 'EB', from: 'APPR', to: 'QQ01' } }, { t: 1, e: { kind: 'step', area: 'WH', from: 'FORE', to: 'IGNR' } }], { allowProvisionalHeading: true });
  assert.equal(map.anchors.length, 0); assert.equal(map.unmapped.find(b => b.berth === 'QQ01')?.reason, 'conflict');
  assert.equal(map.unmapped.find(b => b.berth === 'APPR')?.reason, 'no-evidence');
  assert.equal(map.unmapped.some(b => ['FORE','WRNG','IGNR'].includes(b.berth)), false);
});

test('Waverley three through anchors continue without terminal cab changes', () => {
  const d = scene(), map = buildWaverleyAnchors(d, rows(), [], { allowProvisionalHeading: true });
  const motion = createMotion(buildGraph(waverleyTrackData(d)), map);
  motion.apply({ kind: 'step', area: 'EB', descr: 'SYN1', from: 'QQ01', to: 'QQ02' }, 0);
  let previous = motion.trains()[0]!.leading.point[0];
  for (let i = 0; i < 2000; i++) { motion.advance(0.1); const next = motion.trains()[0]!.leading.point[0]; assert.ok(next >= previous - 1e-6); previous = next; }
  assert.equal(motion.trains()[0]!.lastBerth, 'QQ02');
  motion.apply({ kind: 'step', area: 'EB', descr: 'SYN1', from: 'QQ02', to: 'QQ03' }, 200000);
  for (let i = 0; i < 2000; i++) { motion.advance(0.1); const next = motion.trains()[0]!.leading.point[0]; assert.ok(next >= previous - 1e-6); previous = next; }
  assert.equal(motion.trains()[0]!.lastBerth, 'QQ03');
  assert.ok(previous > map.anchors.find(a => a.berth === 'QQ02')!.point[0]);
  assert.equal(motion.diagnostics().some(issue => issue.kind === 'reversal'), false);
});

test('Waverley packed paths add up zig-zag deltas in tenths of a metre, and only the one packed format is accepted', () => {
  const varint = (n: number): number[] => { const out: number[] = []; for (; n >= 128; n = Math.floor(n / 128)) out.push((n % 128) | 128); out.push(n); return out; };
  const pack = (tenths: number[]): string => btoa(String.fromCharCode(...tenths.flatMap(n => varint(n < 0 ? -2 * n - 1 : 2 * n))));
  const packed = (tenths: number[]) => ({ origin: { lat: 0, lon: 0 }, attribution: 'Synthetic', format: 'waverley-varint-v1', q: 0.1, platforms: [], rails: [{ id: 'invented', tags: {}, path: pack(tenths) }] });
  // steps (200,-50), (800,80) and (-100,-300): each point is the one before plus its step, and a negative step goes back
  assert.doesNotThrow(() => decodeWaverleyAnchorScene(packed([200, -50, 800, 80, -100, -300])), 'every step is a whole number of tenths');
  assert.deepEqual(decodeWaverleyAnchorScene(packed([200, -50, 800, 80, -100, -300])).rails[0]!.path, [[20, -5], [100, 3], [90, -27]]);
  assert.throws(() => decodeWaverleyAnchorScene({ ...packed([0, 0]), format: 'waverley-varint-v2' }), /Unsupported/);
});

test('Waverley refuses two rails with one identity', () => {
  const d = scene();
  assert.throws(() => waverleyTrackData({ ...d, rails: [d.rails[0]!, d.rails[0]!] }), /Duplicate Waverley rail/);
});

test('Waverley screening: a track within 3 m of the face for a real stretch of it identifies the platform, and a dead end is a terminal candidate', () => {
  const d = scene(); // platform 1 spans x 200..400 with its face at z -1001
  const along = (z: number, ...xs: number[]): WaverleyAnchorScene['rails'] => [{ id: 'synthetic/track', path: xs.map(x => [x, z] as [number, number]), tags: {} }];
  const candidates = (rails: WaverleyAnchorScene['rails']) => waverleyPlatformGeometry({ ...d, rails })[0]!.candidates;
  assert.equal(candidates(along(-1004, 0, 200, 400, 800)).length, 1, 'a track 3 m from the face is adjacent');
  assert.equal(candidates(along(-1004, 300, 310)).length, 0, 'ten metres alongside a 200 m platform identify nothing');
  assert.equal(candidates(along(-1004, 300, 360)).length, 1, 'sixty metres do');
  assert.equal(candidates(along(-1004, 0, 200, 400))[0]!.topology, 'terminal-candidate', 'a track that ends at the platform');
  assert.equal(candidates(along(-1004, 0, 200, 400, 800))[0]!.topology, 'through-or-unresolved', 'one that runs on through it');
  // a tilted platform's bounding box reaches well past its 3 m margin, so only the distance itself rejects a far parallel track
  const a = Math.PI / 6, turn = ([x, z]: [number, number]): [number, number] => [x * Math.cos(a) - z * Math.sin(a), x * Math.sin(a) + z * Math.cos(a)];
  const tilted = (z: number): number => waverleyPlatformGeometry({ ...d, platforms: [{ ...d.platforms[0]!, path: d.platforms[0]!.path.map(turn) }],
    rails: [{ id: 'synthetic/track', path: [0, 200, 400, 800].map(x => turn([x, z])), tags: {} }] })[0]!.candidates.length;
  assert.equal(tilted(-1003.5), 1, 'a parallel track 2.5 m off the face');
  assert.equal(tilted(-1010), 0, 'one 9 m off it is no platform track, though inside the bounding box');
});

test('Waverley takes platform associations only from the four arrival and departure events', () => {
  const odd = buildWaverleyAnchors(scene(), [row('1', 'QQ01', 'E'), row('2', 'QQ02', ''), row('3', 'QQ03', 'a')], [], { allowProvisionalHeading: true });
  assert.deepEqual(odd.platformAssociations, []);
  assert.deepEqual(odd.anchors, []);
});
