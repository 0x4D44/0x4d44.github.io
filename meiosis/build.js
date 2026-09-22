#!/usr/bin/env node
/* Optional authoring command: node meiosis/build.js.
 * index.html and the SVG asset are committed output; GitHub Pages needs no build. */
'use strict';
const fs = require('node:fs'), path = require('node:path');
const M = require('./model.js'), D = require('./diagrams.js'), L = require('./learning-data.js');
const root = __dirname, e = D.esc;
const chapters = [['why', 'The problem'], ['inventory', 'Sisters ≠ homologues'], ['journey', 'The whole journey'], ['division-one', 'Meiosis I'], ['crossing-over', 'Crossing over'], ['assortment', 'Independent assortment'], ['division-two', 'Meiosis II'], ['counting', 'Chromosomes & DNA'], ['linkage', 'Linkage & evidence'], ['errors', 'When segregation fails'], ['life-cycles', 'Real life cycles'], ['practice', 'Test your explanation'], ['glossary', 'Glossary']];
const replacements = {
    HERO: D.hero(), VOCABULARY: D.vocabulary(), REPLICATION: D.replication(), STAGE_ZERO: D.stageSVG(0, 'player-art'), STAGE_TEXT: e(M.STAGES[0].text), ATLAS: D.atlas(), COMPARISON: D.comparison(), COHESION: D.cohesion(), CROSSING: D.crossing(), ASSORTMENT: D.assortment(), FINAL_STAGE: D.stageSVG(10, 'final-products-art'), COUNTS_GRAPH: D.countsGraph(), ND: D.nondisjunction(), LIFE_CYCLE: D.lifeCycle(),
    NAV: chapters.map(([id, name], i) => `<li><a href="#${id}" data-nav><span class="num">${String(i + 1).padStart(2, '0')}</span>${e(name)}</a></li>`).join('\n'),
    MOBILE_NAV: chapters.map(([id, name], i) => `<li><a href="#${id}"><span>${String(i + 1).padStart(2, '0')}</span> ${e(name)}</a></li>`).join(''),
    STAGE_BUTTONS: M.STAGES.map(s => `<button type="button" data-stage="${s.id}" aria-pressed="${s.id === 0}" aria-label="Step ${s.id + 1}: ${e(s.short)}" title="${e(s.short)}">${String(s.id + 1).padStart(2, '0')}</button>`).join(''),
    STAGE_OPTIONS: M.STAGES.map(s => `<option value="${s.id}">${String(s.id + 1).padStart(2, '0')} · ${e(s.short)}</option>`).join(''),
    TRANSCRIPT: M.STAGES.map(s => `<li><h4>${e(s.short)} <span class="small">— ${e(s.phase)}</span></h4><p>${e(s.text)}</p><p><strong>${e(s.watch)}</strong></p></li>`).join('\n'),
    CROSS_RESULTS: M.crossingOutcomes().map((s, i) => `<div class="result-card"><b>${s}</b><span>${['M1a', 'M1b', 'P1a', 'P1b'][i]}</span></div>`).join(''),
    COMBINATIONS: M.combinations(3).map(s => `<span class="token${s === 'MMM' || s === 'PPP' ? ' active' : ''}" data-combination="${s}" aria-label="${s}${s === 'MMM' || s === 'PPP' ? ', present in this meiosis' : ', not present in this meiosis'}">${s}</span>`).join(''),
    ND_RESULTS: M.nondisjunction().map((p, i) => `<div class="result-card"><b>${p.chromosomes} · ${p.label}</b><span>Product ${i + 1} → zygote: ${p.zygote}</span></div>`).join(''),
    STATIC_QUIZ: L.quiz.map((q, i) => `<section class="static-question"><h4>${i + 1}. ${e(q.q)}</h4><ol type="A">${q.options.map(o => `<li>${e(o)}</li>`).join('')}</ol><details><summary>Answer and reasoning</summary><p><strong>${String.fromCharCode(65 + q.answer)}. ${e(q.options[q.answer])}</strong> ${e(q.feedback[q.answer])}</p></details></section>`).join('\n'),
    GLOSSARY: L.glossary.map(([term, def, link]) => `<div><dt>${e(term)}</dt><dd>${e(def)} <a href="#${e(link)}" aria-label="Revisit ${e(term)}">↗</a></dd></div>`).join('\n')
};
let html = fs.readFileSync(path.join(root, 'page.template.html'), 'utf8');
for (const [key, value] of Object.entries(replacements))
    html = html.replaceAll('{{' + key + '}}', value);
const wordText = html.replace(/<svg[\s\S]*?<\/svg>/g, '').replace(/<script[\s\S]*?<\/script>/g, '').replace(/<[^>]+>/g, ' ').replace(/&\w+;/g, ' ');
const words = wordText.trim().split(/\s+/).length;
html = html.replaceAll('{{READING}}', String(Math.ceil(words / 220)));
if (/\{\{\w+\}\}/.test(html))
    throw new Error('Unexpanded template marker');
fs.mkdirSync(path.join(root, 'assets'), { recursive: true });
fs.writeFileSync(path.join(root, 'index.html'), html);
fs.writeFileSync(path.join(root, 'assets/meiosis-full-process.svg'), D.atlas());
fs.writeFileSync(path.join(root, 'assets/icon.svg'), '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="15" fill="#081a22"/><path d="M15 14L29 50M29 14L15 50" stroke="#ffa58d" stroke-width="6" stroke-linecap="round"/><path d="M38 18L50 46M50 18L38 46" stroke="#79e0db" stroke-width="6" stroke-linecap="round"/></svg>');
fs.writeFileSync(path.join(root, 'content-stats.json'), JSON.stringify({ words, readingMin: Math.ceil(words / 220), chapters: 12, interactiveLabs: 6, quizQuestions: L.quiz.length, glossaryTerms: L.glossary.length, modelStages: M.STAGES.length }, null, 2) + '\n');
console.log(`Built ${Buffer.byteLength(html)} bytes; ${words} reading words; ${M.STAGES.length} stages; ${L.quiz.length} questions.`);
