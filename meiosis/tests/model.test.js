'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),M=require('../model.js'),D=require('../diagrams.js');
const expectedCells=[1,1,1,1,1,1,2,2,2,2,4],expectedChr=[4,4,4,4,4,4,2,2,2,4,2],expectedDNA=[4,8,8,8,8,8,4,4,4,4,2];
for(let i=0;i<11;i++)test(`stage ${i}: actual lineage, counter and SVG inventory agree`,()=>{
 const s=M.snapshot(i),c=M.counts(i),svg=D.stageSVG(i,'test-'+i);
 assert.equal(s.cells.length,expectedCells[i]);
 for(const cell of s.cells){assert.equal(cell.chromosomeCount,expectedChr[i]);assert.equal(cell.dna,expectedDNA[i]);}
 assert.deepEqual([c.cells,c.chromosomes,c.dna],[expectedCells[i],expectedChr[i],expectedDNA[i]]);
 assert.equal((svg.match(/data-chromosome=/g)||[]).length,expectedCells[i]*expectedChr[i]);
 assert.equal((svg.match(/data-chromatid=/g)||[]).length,expectedCells[i]*expectedDNA[i]);
 assert.ok(svg.includes('role="img"'));assert.ok(svg.includes('<title'));assert.ok(svg.includes('<desc'));
});
test('S phase copies DNA; no additional DNA synthesis occurs between divisions',()=>{
 assert.equal(M.snapshot(0).cells[0].dna,4);
 for(let i=1;i<11;i++)assert.equal(M.snapshot(i).cells.reduce((n,c)=>n+c.dna,0),8);
});
test('all four products have one chromosome from each pair',()=>{
 for(const cell of M.snapshot(10).cells)assert.deepEqual(cell.chromosomes.map(c=>c.pair).sort(),[1,2]);
});
test('DNA segments cover every chromatid, without overlap or gap',()=>{
 for(let i=0;i<11;i++)for(const c of M.snapshot(i).cells.flatMap(c=>c.chromosomes))for(const ch of c.chromatids){
  assert.equal(ch.segments[0].start,0);assert.equal(ch.segments.at(-1).end,1);
  ch.segments.forEach((s,j)=>{assert.ok(s.end>s.start);if(j)assert.equal(ch.segments[j-1].end,s.start);assert.ok(['M','P'].includes(s.origin));});
 }
});
test('reciprocal crossover conserves each parental-origin DNA quantity',()=>{
 for(let i=1;i<11;i++){
  const totals={M:0,P:0};M.snapshot(i).cells.forEach(cell=>cell.chromosomes.forEach(c=>c.chromatids.forEach(ch=>ch.segments.forEach(s=>totals[s.origin]+=s.end-s.start))));
  assert.ok(Math.abs(totals.M-4)<1e-10);assert.ok(Math.abs(totals.P-4)<1e-10);
 }
});
test('exactly two long chromatids are recombinant; their identities persist',()=>{
 const recombinants=s=>s.cells.flatMap(c=>c.chromosomes.flatMap(c=>c.chromatids)).filter(c=>c.segments.length===2).map(c=>c.id).sort();
 assert.deepEqual(recombinants(M.snapshot(2)),[]);
 for(let i=3;i<11;i++)assert.deepEqual(recombinants(M.snapshot(i)),['M1b','P1a']);
 assert.deepEqual(recombinants(M.snapshot(10,false)),[]);
});
test('anaphase I and II expose per-pole inventories separately',()=>{
 assert.deepEqual(M.counts(5).pole,{chromosomes:2,dna:4,c:2});
 assert.deepEqual(M.counts(9).pole,{chromosomes:2,dna:2,c:1});
 assert.equal(M.counts(9).chromosomes,4);assert.equal(M.counts(9).dna,4);
 assert.equal(M.counts(8).chromosomes,2);assert.equal(M.counts(8).dna,4);
});
test('human counts at key checkpoints and anaphase boundaries',()=>{
 assert.deepEqual([0,1,6,10].map(i=>[M.counts(i,23).chromosomes,M.counts(i,23).dna]),[[46,46],[46,92],[23,46],[23,23]]);
 assert.equal(M.counts(9,23).chromosomes,46);assert.equal(M.counts(9,23).pole.chromosomes,23);
});
test('fresh model snapshots cannot corrupt one another',()=>{
 const a=M.snapshot(3);a.cells[0].chromosomes[0].id='bad';a.cells[0].chromosomes[0].chromatids[0].segments[0].end=0;
 assert.equal(M.snapshot(3).cells[0].chromosomes[0].id,'M1');assert.equal(M.snapshot(3).cells[0].chromosomes[0].chromatids[0].segments[0].end,1);
 assert.ok(Object.isFrozen(M.STAGES));assert.ok(Object.isFrozen(M.STAGES[0]));
});
for(const cut of [1,2,3])test(`crossing interval ${cut}: locus order and allele quantities conserved`,()=>{
 const a=M.crossingOutcomes(cut);assert.equal(a[0],'ABCD');assert.equal(a[3],'abcd');assert.equal(new Set(a).size,4);
 for(let locus=0;locus<4;locus++){assert.equal(a.filter(s=>s[locus]==='ABCD'[locus]).length,2);assert.equal(a.filter(s=>s[locus]==='abcd'[locus]).length,2);}
 assert.deepEqual(M.crossingOutcomes(cut,false),['ABCD','ABCD','abcd','abcd']);
});
test('all eight three-pair orientations produce complementary duplicate pairs',()=>{
 const seen=new Set();for(let bits=0;bits<8;bits++){const flags=[0,1,2].map(i=>!!(bits&(1<<i))),a=M.assort(flags);assert.equal(a.products.length,4);assert.equal(new Set(a.products).size,2);assert.equal(a.left,a.products[0]);assert.equal(a.products[0],a.products[1]);assert.equal(a.products[2],a.products[3]);for(let j=0;j<3;j++)assert.notEqual(a.left[j],a.right[j]);seen.add(a.left);}
 assert.equal(seen.size,8);assert.deepEqual([...seen].sort(),M.combinations(3).sort());
});
test('2^n handles one pair through the full human complement',()=>{assert.equal(M.combinationCount(1),2);assert.equal(M.combinationCount(5),32);assert.equal(M.combinationCount(23),8388608);assert.equal(M.combinationCount(23)**2,70368744177664);});
test('non-disjunction I versus II signatures and fertilisation counts',()=>{
 assert.deepEqual(M.nondisjunction('I').map(p=>p.chromosomes),[3,3,1,1]);assert.deepEqual(M.nondisjunction('II').map(p=>p.chromosomes),[3,1,2,2]);
 assert.deepEqual(M.nondisjunction('I',23).map(p=>p.zygote),[47,47,45,45]);assert.deepEqual(M.nondisjunction('II',23).map(p=>p.zygote),[47,45,46,46]);
 for(const mode of ['none','I','II'])assert.equal(M.nondisjunction(mode).reduce((n,p)=>n+p.chromosomes,0),8);
});
test('recombination arithmetic, including zeros and samples above fifty percent',()=>{assert.equal(M.recombination(420,420,80,80).percent,16);assert.equal(M.recombination(360,340,150,150).percent,30);assert.equal(M.recombination(10,10,0,0).percent,0);assert.ok(Math.abs(M.recombination(1,1,2,2).percent-100*4/6)<1e-10);});
test('invalid model inputs are rejected, not silently normalised',()=>{
 for(const x of [-1,11,1.2,NaN,'2'])assert.throws(()=>M.snapshot(x));
 for(const x of [0,24,-1,2.3])assert.throws(()=>M.combinationCount(x));
 for(const x of [[],[1],['M'],Array(24).fill(true)])assert.throws(()=>M.assort(x));
 for(const x of [0,4,-1,2.3])assert.throws(()=>M.crossingOutcomes(x));
 assert.throws(()=>M.nondisjunction('III'));assert.throws(()=>M.counts(1,0));
 assert.throws(()=>M.recombination(0,0,0,0));assert.throws(()=>M.recombination(1,-1,1,1));assert.throws(()=>M.recombination(1,1,.5,1));assert.throws(()=>M.recombination(1,1,Infinity,1));
});
