import test from 'node:test';
import assert from 'node:assert/strict';
import { CATALOG } from '../src/content.js';
import { optionMarkup, rivalRowsMarkup, stageRowsMarkup, overallRowsMarkup } from '../src/ui.js';

test('catalog options expose mechanical identity without injecting labels', () => {
  const markup=optionMarkup(CATALOG,{carId:'lumen-f2',stageId:'aurora-forest',difficultyId:'hard'});
  assert.match(markup.cars,/LUMEN F2/);
  assert.match(markup.cars,/FWD · 152 BHP/);
  assert.match(markup.cars,/value="lumen-f2"[^>]*checked/);
  assert.match(markup.stages,/AURORA FOREST/);
  assert.match(markup.stages,/6\.8 KM/);
  assert.match(markup.difficulties,/WORKS ATTACK/);
  assert.match(markup.difficulties,/value="hard"[^>]*checked/);
  const hostile=optionMarkup({cars:[{...CATALOG.cars[0],name:'<img onerror=alert(1)>'}],stages:CATALOG.stages,regions:CATALOG.regions,weather:CATALOG.weather,difficulties:CATALOG.difficulties},{carId:'cairn-r4',stageId:'kestrel-ridge',difficultyId:'normal'});
  assert.doesNotMatch(hostile.cars,/<img/);
  assert.match(hostile.cars,/&lt;IMG/);
});

test('stage and overall standings markup keeps finishers, retirements, and gaps legible', () => {
  const stage=stageRowsMarkup([
    {position:1,id:'player',name:'Player',isPlayer:true,status:'finished',totalMs:100000,points:25},
    {position:2,id:'rival',name:'Rival',isPlayer:false,status:'finished',totalMs:102340,points:18},
    {position:3,id:'dnf',name:'DNF',isPlayer:false,status:'retired',totalMs:null,points:0}
  ]);
  assert.match(stage,/YOU/);
  assert.match(stage,/\+2\.340/);
  assert.match(stage,/RETIRED/);
  const overall=overallRowsMarkup([
    {position:1,id:'player',name:'Player',stages:2,points:43},
    {position:2,id:'rival',name:'Rival',stages:2,points:40}
  ]);
  assert.match(overall,/3 PTS/);
  assert.match(overall,/43/);
  const rivals=rivalRowsMarkup([{name:'<img onerror=alert(1)>',status:'finished',totalMs:102340}],100000);
  assert.doesNotMatch(rivals,/<img/);
  assert.match(rivals,/&lt;IMG/);
});
