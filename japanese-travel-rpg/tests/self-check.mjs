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
const memory=createMemoryStore();await memory.set("progress",afterUk);assert.ok(mergeProgress(await memory.get("progress"),chapters,2000).completedLessons.includes("uk-home"));
for(const asset of["index.html","styles.css","app.js","content.js","engines.js","manifest.webmanifest","sw.js","icons/icon.svg"]){assert.ok(fs.existsSync(path.join(root,asset)),`${asset} exists`)}
assert.equal(JSON.parse(read("manifest.webmanifest")).display,"standalone");assert.ok(read("sw.js").includes("cache.addAll"));assert.ok(read("app.js").includes("createBrowserStore"));assert.ok(read("app.js").includes("speechSynthesis"));assert.ok(read("app.js").includes("privacyAcknowledged"));assert.ok(!/sk-[A-Za-z0-9]{20,}/.test(read("app.js")+read("README.md")),"no hard-coded API key");assert.ok(!/\b(?:TODO|FIXME)\b/i.test(read("app.js")+read("content.js")+read("index.html")),"no TODO/FIXME markers");
console.log("PASS self-checks: content, route unlocking, SRS, persistence, phrasebook search, romaji settings, AI gating, PWA assets.");
