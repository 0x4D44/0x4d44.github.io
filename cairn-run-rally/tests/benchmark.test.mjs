import test from 'node:test';
import assert from 'node:assert/strict';
import { CATALOG } from '../src/content.js';
import { simulateRun } from '../src/benchmark.js';

test('the deterministic benchmark reports stable bounded metrics for every shipped pair', () => {
  for(const stageSpec of CATALOG.stages){
    const region=CATALOG.regions.find(candidate=>candidate.id===stageSpec.regionId);
    const weatherSpec=CATALOG.weather.find(candidate=>candidate.id===region.weatherIds[0]);
    for(const carSpec of CATALOG.cars){
      const maxSeconds=stageSpec.expectedDurationSeconds[1]+30;
      const first=simulateRun({stageSpec,carSpec,weatherSpec,maxSeconds});
      const second=simulateRun({stageSpec,carSpec,weatherSpec,maxSeconds});
      assert.deepEqual(first,second,`${stageSpec.id}/${carSpec.id} drifted`);
      assert.equal(first.finished,true,`${stageSpec.id}/${carSpec.id} did not finish`);
      assert.equal(first.finite,true,`${stageSpec.id}/${carSpec.id} became non-finite`);
      assert.ok(first.recoveries<=1,`${stageSpec.id}/${carSpec.id} recoveries=${first.recoveries}`);
      assert.ok(first.damage<.15,`${stageSpec.id}/${carSpec.id} damage=${first.damage}`);
      assert.ok(first.time>=stageSpec.expectedDurationSeconds[0]&&first.time<=stageSpec.expectedDurationSeconds[1],`${stageSpec.id}/${carSpec.id} time=${first.time}`);
      assert.equal(first.splits.length,stageSpec.splits.length);
      assert.equal(first.notes,stageSpec.notes.length);
    }
  }
});
