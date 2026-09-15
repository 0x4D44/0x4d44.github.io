import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import {combat, referenceCombat, sweepConfiguration, hit, polygon, deckDraw, setupOutcome, hex} from '../model.mjs';
const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const data = JSON.parse(read('../evidence/exhibit.json'));
const recorded = JSON.parse(read('../evidence/test_results.json'));
const patches = JSON.parse(read('../evidence/patch_manifest.json'));
const html = read('../index.html');

test('documented 6,5,1 vs 2,3 changes the real casualty outcome', () => {
  const old = combat([6,5,1],[2,3],false), repaired = combat([6,5,1],[2,3],true);
  assert.deepEqual(old.d, [3,6]); assert.equal(old.lostA,1); assert.equal(old.lostD,1);
  assert.deepEqual(repaired.d, [3,2]); assert.equal(repaired.lostA,0); assert.equal(repaired.lostD,2);
});
test('reverse defender roll order avoids that particular error', () => {
  assert.equal(combat([6,5,1],[3,2],false).lostA, 0);
});
test('defender wins ties, and unused die slots are not compared', () => {
  assert.equal(combat([6],[6,1],false).lostA,1);
  assert.equal(combat([6,5,1],[2],false).pairs.length,1);
  assert.equal(referenceCombat([1,2],[2,1]).lostA,2);
});
test('every legal face combination: browser totals match recorded binary mismatch totals', () => {
  let n=0, old=0, fixed=0;
  for(let a=1;a<=3;a++) for(let d=1;d<=2;d++) {
    const s=sweepConfiguration(a,d); n+=s.cases; old+=s.original; fixed+=s.repaired;
    assert.equal(s.cases,6**(a+d));
  }
  assert.equal(n,10836); assert.equal(old,2317); assert.equal(fixed,0);
  assert.equal(old,recorded.combat_exhaustive.original.mismatches);
  assert.equal(fixed,recorded.combat_exhaustive.patched.mismatches);
});
test('invalid dice fail explicitly without mutating caller arrays', () => {
  for(const [a,d] of [[[],[1]],[[0],[1]],[[7],[1]],[[1],[1,2,3]],[[1.5],[1]],[[1,2,3,4],[1]]]) assert.throws(()=>combat(a,d),RangeError);
  const a=[1,6,3],d=[1,2]; combat(a,d); assert.deepEqual(a,[1,6,3]); assert.deepEqual(d,[1,2]);
});
test('44th / 45th draws preserve final entry only in repaired model', () => {
  assert.equal(deckDraw(43,false).slot,42); assert.equal(deckDraw(44,false).slot,0);
  assert.equal(deckDraw(44,true).slot,43); assert.equal(deckDraw(44,true).reshuffled,false);
  assert.equal(deckDraw(45,true).slot,0); assert.equal(deckDraw(45,true).reshuffled,true);
  for(const fixed of [false,true]) {
    const counts=[0,0,0,0]; for(let i=1;i<=44;i++){const d=deckDraw(i,fixed); counts[d.slot<42?d.slot%3:3]++;}
    assert.deepEqual(counts,recorded.deck_boundary[fixed?'patched':'original'].first44_card_types);
  }
  assert.throws(()=>deckDraw(0),RangeError); assert.throws(()=>deckDraw(46),RangeError);
});
test('Setup stages edits, requires explicit OK, and failure has no editing session', () => {
  assert.deepEqual(setupOutcome(0,false),{accepted:false,name:'Ada'});
  assert.deepEqual(setupOutcome(0,true),{accepted:false,name:'Player1'});
  assert.deepEqual(setupOutcome(1,true),{accepted:true,name:'Ada'});
  assert.deepEqual(setupOutcome(-1,false),{accepted:true,name:'Player1'});
  assert.deepEqual(setupOutcome(-1,true),{accepted:false,name:'Player1'});
});
test('42 extracted territories, eight corrections, seven affected regions', () => {
  assert.equal(data.territories.length,42);
  assert.equal(data.territories.reduce((n,t)=>n+t.corrections.length,0),8);
  assert.deepEqual(data.territories.filter(t=>t.corrections.length).map(t=>t.id),[27,30,33,36,37,39,42]);
  for(const t of data.territories) {
    assert.deepEqual(t.points[0],t.points.at(-1));
    assert.ok(t.points.every(p=>p.length===2 && p.every(Number.isInteger)));
    assert.ok(!t.points.some(p=>p[0]===-100&&p[1]===-100));
    assert.equal(polygon(t,false).length,t.points.length+1);
    assert.equal(polygon(t,false,false).length,t.points.length);
  }
});
test('all seven extracted witness points reproduce the recorded classifications', () => {
  for(const t of data.territories.filter(t=>t.witness)) {
    const [x,y]=t.witness.witness;
    assert.equal(hit(polygon(t,false),x,y),t.witness.old_hit,t.name+' original');
    assert.equal(hit(polygon(t,true),x,y),t.witness.patched_hit,t.name+' repaired');
    assert.notEqual(t.witness.old_hit,t.witness.patched_hit,t.name);
  }
});
test('winding model handles clockwise and counterclockwise simple polygons', () => {
  const p=[[0,0],[10,0],[10,10],[0,10]];
  assert.equal(hit(p,5,5),true);assert.equal(hit([...p].reverse(),5,5),true);assert.equal(hit(p,-1,5),false);
});
test('binary anatomy agrees with the patch manifest and recorded integrity', () => {
  assert.equal(data.segments.length,10);assert.equal(data.segments.slice(0,9).reduce((n,s)=>n+s.length,0),22126);
  assert.equal(data.segments[4].offset+0xd5f+1,0x6360);
  assert.equal(data.segments[4].repairedLength-data.segments[4].length,94);
  assert.equal(data.segments[8].repairedLength-data.segments[8].length,58);
  assert.equal(patches.file_size,recorded.ne_integrity.file_size);
  assert.equal(patches.input_sha256,recorded.ne_integrity.original_sha256);
  assert.equal(patches.output_sha256,recorded.ne_integrity.patched_sha256);
  assert.equal(hex(0x6360),'0x6360');
});
test('source page includes static findings, references, no-JS fallback and shared almanac link', () => {
  assert.equal((html.match(/class="finding"/g)||[]).length,9);
  assert.ok(html.includes('<noscript>'));assert.ok(html.includes('<script defer src="/almanac-back.js"></script>'));
  assert.ok(html.includes('certification that WINRISK is bug-free'));
});
test('all local exhibit href/src targets and fragment IDs resolve', () => {
  const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);assert.equal(ids.length,new Set(ids).size);
  for(const [,url] of html.matchAll(/\b(?:href|src)="([^"]+)"/g)) {
    if(url.startsWith('#')) assert.ok(ids.includes(url.slice(1)),url);
    else if(!/^(?:https?:|data:|\/)/.test(url)) assert.ok(existsSync(new URL('../'+url,import.meta.url)),url);
  }
});
