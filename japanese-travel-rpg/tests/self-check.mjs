import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {allPhrases,allSigns,chapters} from "../content.js";
import{aiModeStatus,completeLesson,createInitialProgress,createMemoryStore,dueCards,gradeReview,mergeProgress,routeUnlockState,scheduleCard,scriptedFeedback,searchPhrasebook,shouldShowRomaji}from"../engines.js";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const ids=["uk-home","airport-flight","arrival-japan","tokyo-transport-hotel","tokyo-food-conbini","tokyo-shopping-attractions","kyoto-temples-etiquette","nara-side","hakone-fuji-side","ryokan-onsen-side","osaka-food-shopping","hiroshima-miyajima-side","rural-transport-side","fukushima-resilience","tohoku-hokkaido-extension","return-journey"];
const read=name=>fs.readFileSync(path.join(root,name),"utf8");
assert.equal(chapters.length,16,"all required chapters plus northern extension exist");
assert.deepEqual(chapters.map(c=>c.id),ids,"route order is stable");
for(const c of chapters){assert.ok(c.summary&&c.goal,`${c.id} has summary and goal`);assert.ok(c.grammar.length>=2,`${c.id} has explanations`);assert.ok(c.phrases.length>=5,`${c.id} has phrases`);assert.ok(c.signs.length>=4,`${c.id} has signs`);assert.ok(c.culture.length>=2,`${c.id} has culture notes`);assert.ok(c.roleplay.steps.length>=3,`${c.id} has roleplay`);assert.ok(c.confidence.length>=3,`${c.id} has checks`)}
const phrases=allPhrases(),signs=allSigns();
assert.equal(phrases.length,80,"phrasebook has 80 seeded phrases");assert.equal(signs.length,64,"kanji/sign field notes are substantial");
assert.equal(new Set(phrases.map(p=>p.id)).size,phrases.length,"phrase ids unique");assert.equal(new Set(signs.map(s=>s.id)).size,signs.length,"sign ids unique");
let progress=createInitialProgress(chapters,0);assert.equal(progress.reviewCards.length,144,"review cards generated from content");assert.equal(routeUnlockState(chapters[0],progress,chapters).unlocked,true);assert.equal(routeUnlockState(chapters[1],progress,chapters).unlocked,false);
const afterUk=completeLesson(progress,chapters[0],1000);assert.equal(routeUnlockState(chapters[1],afterUk,chapters).unlocked,true,"route unlocks");assert.ok(afterUk.stamps.includes("uk-home"));assert.ok(afterUk.learnedPhraseIds.includes("uk-hello"));
const scheduled=scheduleCard(progress.reviewCards[0],"good",0);assert.ok(scheduled.due>0,"SRS schedules");const afterGrade=gradeReview(progress,progress.reviewCards[0].id,"again",0);assert.equal(afterGrade.reviewLog.length,1);assert.equal(afterGrade.reviewCards.find(c=>c.id===progress.reviewCards[0].id).lapses,1);
assert.ok(dueCards(progress,0,"daily").length<=12);assert.ok(dueCards(progress,0,"deep").length<=40);
assert.ok(searchPhrasebook("allergy",phrases).some(p=>p.id==="food-allergy"));assert.ok(searchPhrasebook("運休",phrases).some(p=>p.id==="fuji-closed"));
assert.equal(shouldShowRomaji({romajiMode:"fade"},1,false),true);assert.equal(shouldShowRomaji({romajiMode:"fade"},9,false),false);assert.equal(shouldShowRomaji({romajiMode:"mostly-off"},1,true),true);
assert.equal(aiModeStatus({aiMode:false,apiKey:""}).enabled,false);assert.equal(aiModeStatus({aiMode:true,apiKey:"sk-local-test-key-123"}).enabled,true);
const lookup=new Map(phrases.map(p=>[p.id,p]));assert.equal(scriptedFeedback("こんにちは",chapters[0].roleplay.steps[0],lookup).quality,"understood");
// ALM-BUG-FLUXHOMEARPA-00004: the review "All caught up!" empty state must gate on the
// NEGATION of "a card is due" — it previously reused revHasCard, so it showed when a card
// existed and hid when the queue was empty. The view sets v.revEmpty=!card; the empty-state
// sc-if must bind revEmpty, not revHasCard.
{
  const idx=read("index.html");
  assert.ok(/v\.revEmpty\s*=\s*!card/.test(idx),"review view must compute revEmpty=!card");
  const empty=idx.match(/<sc-if value="\{\{ (\w+) \}\}"[^>]*>\s*<div[^>]*>\s*<div[^>]*>済<\/div>/);
  assert.ok(empty,"the 'All caught up!' (済) empty-state sc-if should be found");
  assert.equal(empty[1],"revEmpty","the empty-state must gate on revEmpty, not revHasCard");
}
// ALM-BUG-FLUXHOMEARPA-00003: roleplay safe answers / feedback look up
// step.expectedPhraseIds in the OVERLAID phrase map. content-extra.js remaps each
// overlaid phrase to a new id, so the overlay MUST re-point the roleplay steps too,
// or every safe-answer suggestion silently filters out. Guard both: (a) index.html
// still carries the re-point, and (b) after applying the same overlay every roleplay
// expectedPhraseId resolves and scriptedFeedback yields suggestions.
{
  const {EXTRA}=await import("../content-extra.js");
  assert.ok(/st\.expectedPhraseIds\s*=\s*\[\s*np\.id\s*\]/.test(read("index.html")),
    "index.html overlay must re-point roleplay steps to the overlaid phrase ids");
  // Apply the exact overlay index.html runs (componentDidMount), on fresh chapters.
  const {chapters:ov,allPhrases:ovAll}=await import("../content.js?overlay");
  ov.forEach(ch=>{const x=EXTRA[ch.id];if(!x)return;
    if(x.phrases){ch.phrases=x.phrases.map((p,i)=>({id:ch.id+"-p"+i,japanese:p.j,kana:p.j,romaji:p.r,english:p.e,politeness:p.pol||"safe polite",usage:p.u||"Traveller phrase",seg:p.seg||null,variants:[]}));
      if(ch.roleplay&&ch.roleplay.steps)ch.roleplay.steps.forEach((st,i)=>{const np=ch.phrases[i];if(!np)return;st.expectedPhraseIds=[np.id];st.acceptKeywords=[np.japanese,np.japanese.replace("。",""),(np.english||"").split(" ")[0],np.id.split("-")[0]];});}
  });
  const ovLookup=new Map(ovAll().map(p=>[p.id,p]));
  const missing=[];
  for(const ch of ov)for(let i=0;i<ch.roleplay.steps.length;i++)for(const id of ch.roleplay.steps[i].expectedPhraseIds)if(!ovLookup.get(id))missing.push(`${ch.id}#${i}:${id}`);
  assert.deepEqual(missing,[],`every roleplay expectedPhraseId must resolve after overlay; missing: ${missing.join(", ")}`);
  const uk=ov.find(c=>c.id==="uk-home");
  assert.ok(scriptedFeedback("",uk.roleplay.steps[0],ovLookup).suggestions.length>0,
    "overlaid roleplay must still offer safe-answer suggestions");
}
const memory=createMemoryStore();await memory.set("progress",afterUk);assert.ok(mergeProgress(await memory.get("progress"),chapters,2000).completedLessons.includes("uk-home"));
for(const asset of["index.html","support.js","GuideFace.dc.html","ios-frame.jsx","content.js","content-extra.js","engines.js","manifest.webmanifest","sw.js","icons/icon.svg"]){assert.ok(fs.existsSync(path.join(root,asset)),`${asset} exists`)}
const html=read("index.html");assert.equal(JSON.parse(read("manifest.webmanifest")).display,"standalone");assert.ok(read("sw.js").includes("nihon-quest-v3"));assert.ok(read("sw.js").includes("cache.addAll"));assert.ok(html.includes("support.js"));assert.ok(html.includes("ios-frame.jsx"));assert.ok(html.includes("content-extra.js"));assert.ok(html.includes("GuideFace"));assert.ok(read("engines.js").includes("createBrowserStore"));assert.ok(html.includes("speechSynthesis"));assert.ok(!/sk-[A-Za-z0-9]{20,}/.test(html+read("README.md")),"no hard-coded API key");assert.ok(!/\b(?:TODO|FIXME)\b/i.test(html+read("content.js")+read("content-extra.js")),"no TODO/FIXME markers");
console.log("PASS self-checks: content, route unlocking, SRS, persistence, phrasebook search, romaji settings, AI gating, PWA assets.");
