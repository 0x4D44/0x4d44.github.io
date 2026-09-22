'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),C=require('../integrate-catalog.js');
// Representative trusted catalog fixture. This is NOT a copy of the full repo.
const fixture=`window.ESSAYS = [
  {slug:"existing",title:"Leave me alone",url:"https://0x4d44.github.io/existing/"}
];
window.COLLECTIONS = [
  {id:"science",name:"The Science Bench", slugs:["existing",
    "other"]},
  {id:"other",name:"Another shelf", slugs:["existing"]}
];`;
test('catalog registration adds one entry and one science-shelf membership',()=>{
 const out=C.integrate(fixture),c=C.validate(out);assert.equal(c.ESSAYS.length,2);assert.equal(c.ESSAYS[1].title,'Leave me alone');assert.equal(c.COLLECTIONS[1].slugs.length,1);assert.ok(c.COLLECTIONS[0].slugs.includes('meiosis'));assert.ok(out.includes('Leave me alone'));
});
test('catalog registration is idempotent and preserves the original byte content on repeat',()=>{const once=C.integrate(fixture);assert.equal(C.integrate(once),once);});
test('one-line shelf arrays also work',()=>{const f=fixture.replace('slugs:["existing",\n    "other"]','slugs:["existing", "other"]');C.validate(C.integrate(f));});
test('missing or ambiguous catalog structures fail closed',()=>{assert.throws(()=>C.integrate(fixture.replace('id:"science"','id:"wrong"')));assert.throws(()=>C.validate(fixture));assert.throws(()=>C.integrate('window.ESSAYS=[];'));});
test('catalog metadata has valid route, existing illustration and a short hook',()=>{const e=C.entry();assert.equal(e.slug,'meiosis');assert.equal(e.illustration,'ill-dna');assert.ok(e.tagline.split(/\s+/).length<=55);assert.ok(e.words>7000);assert.equal(e.readingMin,Math.ceil(e.words/220));});
