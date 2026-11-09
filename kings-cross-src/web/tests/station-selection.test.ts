import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createStationSelection, stationFromSearch, stationHref, stationMessage } from '../src/station-selection.ts';

test('station bookmarks preserve UTC replay inputs and reject ambiguous or unknown stations', () => {
  const original = 'https://example.test/kings-cross/?trains=replay&date=20261108&speed=8#view';
  const url = new URL(stationHref(original, 'st-pancras'));
  assert.equal(url.searchParams.get('trains'), 'replay'); assert.equal(url.searchParams.get('date'), '20261108');
  assert.equal(url.searchParams.get('speed'), '8'); assert.equal(url.hash, '#view');
  assert.equal(stationFromSearch(url.search), 'st-pancras');
  assert.equal(stationFromSearch('?station=edinburgh-waverley'), 'edinburgh-waverley');
  for (const search of ['', '?station=other', '?station=__proto__', '?station=st-pancras&station=kings-cross']) assert.equal(stationFromSearch(search), 'kings-cross');
});

test('new stations advertise view-only and unbuilt states instead of KX live trains', () => {
  assert.match(stationMessage('st-pancras'), /view only, live trains not yet enabled/);
  assert.match(stationMessage('edinburgh-waverley'), /model not built yet.*Live trains not enabled/);
  assert.match(stationMessage('kings-cross'), /King's Cross/);
});

test('loading, failure, retry and stale lazy requests keep the last usable station', async () => {
  let resolveOld!: (v: number) => void, fail = true;
  const activated: string[] = [], phases: string[] = [];
  const selection = createStationSelection({
    load: async (id) => {
      if (id === 'st-pancras') return new Promise<number>(resolve => { resolveOld = resolve; });
      if (id === 'edinburgh-waverley' && fail) throw new Error('chunk unavailable');
      return 1;
    },
    activate: (id) => { activated.push(id); return 'hopping'; }, change: s => { phases.push(s.phase); },
  });
  const old = selection.select('st-pancras');
  assert.equal(selection.state().phase, 'loading');
  await selection.select('edinburgh-waverley');
  assert.equal(selection.state().phase, 'failed'); assert.equal(selection.state().selected, 'kings-cross');
  assert.match(selection.state().error!, /chunk unavailable/);
  fail = false; await selection.select('edinburgh-waverley');
  resolveOld(1); await old;
  assert.deepEqual(activated, ['edinburgh-waverley']);
  assert.equal(selection.state().phase, 'hopping'); selection.finish();
  assert.equal(selection.state().phase, 'ready'); assert.equal(selection.state().selected, 'edinburgh-waverley');
  assert.ok(phases.includes('failed')); selection.dispose();
});

test('disposing during a lazy request prevents scene activation', async () => {
  let resolve!: (value: number) => void, activations = 0;
  const selection = createStationSelection({load: () => new Promise<number>(r => { resolve = r; }),
    activate: () => { ++activations; return 'ready'; }, change: () => {}});
  const pending = selection.select('edinburgh-waverley'); selection.dispose(); resolve(1); await pending;
  assert.equal(activations, 0);
});
