'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const root=path.join(__dirname,'..'),html=fs.readFileSync(path.join(root,'index.html'),'utf8'),L=require('../learning-data.js');
test('complete static text, diagrams and references without JavaScript',()=>{
 assert.match(html,/<html lang="en-GB">/);assert.ok((html.match(/<svg /g)||[]).length>=12);assert.match(html,/Names of stages are not required/);assert.match(html,/No S phase/);assert.match(html,/non-sister chromatids/);assert.match(html,/2026–27/);assert.ok(!html.includes('{{'));assert.match(html,/same twelve questions/);
});
test('all fragment links and aria-labelledby targets resolve to unique IDs',()=>{
 const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);assert.equal(new Set(ids).size,ids.length,'Duplicate HTML/SVG IDs');
 const have=new Set(ids);for(const m of html.matchAll(/href="#([^"]+)"/g))assert.ok(have.has(m[1]),m[1]);for(const m of html.matchAll(/aria-labelledby="([^"]+)"/g))for(const id of m[1].split(/\s+/))assert.ok(have.has(id),id);
});
test('local production assets exist and require no CDN',()=>{
 const sources=[...html.matchAll(/(?:src|href)="([^"#]+)"/g)].map(m=>m[1]);for(const source of sources){if(source.startsWith('https:')||source.startsWith('#')||source.startsWith('../')||source==='/almanac-back.js')continue;assert.ok(fs.existsSync(path.join(root,source)),source);}
 assert.ok(!/<script[^>]+src="https?:/.test(html));assert.match(html,/<script defer src="\/almanac-back.js"><\/script>/);
});
test('question bank has feedback for every answer and all correct answers are valid',()=>{
 assert.equal(L.quiz.length,12);assert.equal(L.glossary.length,29);
 for(const q of L.quiz){assert.equal(q.options.length,4);assert.equal(q.feedback.length,4);assert.ok(q.answer>=0&&q.answer<4);assert.match(html,new RegExp('id="'+q.link+'"'));}
});
test('regeneration is deterministic and committed output is fresh',()=>{
 const before=fs.readFileSync(path.join(root,'index.html'),'utf8');cp.execFileSync(process.execPath,[path.join(root,'build.js')]);assert.equal(fs.readFileSync(path.join(root,'index.html'),'utf8'),before);
});
test('no persistence, requests, dynamic execution or third-party assets in application code',()=>{
 const code=fs.readFileSync(path.join(root,'app.js'),'utf8');assert.ok(!/\b(localStorage|sessionStorage|fetch|XMLHttpRequest|eval)\s*[.(]/.test(code));assert.ok(!/new Function/.test(code));assert.match(code,/visibilitychange/);assert.match(code,/beforeprint/);
});
