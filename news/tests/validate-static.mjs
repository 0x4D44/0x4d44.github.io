import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const newsDir = path.resolve(here, "..");
const articlesSource = fs.readFileSync(path.join(newsDir, "articles.js"), "utf8");
const rendererSource = fs.readFileSync(path.join(newsDir, "news.js"), "utf8");
const context = { window: {} };

vm.runInNewContext(articlesSource, context, { filename: "articles.js" });

const articles = context.window.NEWS_ARTICLES;
assert.ok(Array.isArray(articles) && articles.length > 0, "article corpus should load");

const ids = articles.map((article) => article.id);
assert.equal(new Set(ids).size, ids.length, "article ids must be unique");

function validateLongForm({ id, minimumWords, inlineImages, noticePattern }) {
  const article = articles.find((item) => item.id === id);
  assert.ok(article, `${id} should be present`);
  assert.equal(article.category, "Voices");
  assert.ok(article.body.length >= 20, `${id} should retain its long-form structure`);

  const wordCount = article.body.join(" ").trim().split(/\s+/).length;
  assert.ok(wordCount >= minimumWords, `${id} should have at least ${minimumWords} words, found ${wordCount}`);
  assert.match(article.notice, noticePattern);
  assert.match(article.imageCaption, /AI-generated/);
  assert.equal(article.images.length, inlineImages, `${id} should retain its planned inline visuals`);

  assert.ok(fs.existsSync(path.join(newsDir, article.image)), `${article.image} should exist`);
  for (const image of article.images) {
    assert.ok(image.alt && image.caption, `${image.src} needs accessible copy`);
    assert.ok(Number.isInteger(image.afterParagraph), `${image.src} needs a paragraph position`);
    assert.ok(image.afterParagraph >= 0 && image.afterParagraph < article.body.length);
    assert.ok(fs.existsSync(path.join(newsDir, image.src)), `${image.src} should exist`);
  }

  return wordCount;
}

const retailWordCount = validateLongForm({
  id: "voices-plan-a-serious-plan-incomplete-proof",
  minimumWords: 1800,
  inlineImages: 3,
  noticePattern: /real M&S ESG Report 2026/,
});

const aiWordCount = validateLongForm({
  id: "voices-ai-2040-plan-a-stack-of-miracles",
  minimumWords: 2300,
  inlineImages: 5,
  noticePattern: /real AI Futures Project report AI 2040: Plan A/,
});

const chartSources = new Map([
  ["voices-plan-a-emissions.svg", /M&amp;S ESG Report 2026/],
  ["voices-plan-a-targets.svg", /M&amp;S ESG Report 2026/],
  ["voices-ai-plan-a-compute.svg", /AI Futures Project/],
  ["voices-ai-plan-a-confidence.svg", /AI Futures Project/],
  ["voices-ai-plan-a-work.svg", /AI Futures Project/],
]);

for (const [chartName, sourcePattern] of chartSources) {
  const chart = fs.readFileSync(path.join(newsDir, "images", chartName), "utf8");
  assert.match(chart, /<title id="title">/);
  assert.match(chart, /<desc id="desc">/);
  assert.match(chart, sourcePattern);
}

assert.match(rendererSource, /a\.imageCaption/);
assert.match(rendererSource, /a\.notice/);
assert.match(rendererSource, /Opinion note:/);

console.log(`Daily Flange Plan A validation passed (retail ${retailWordCount} words; AI ${aiWordCount} words).`);
