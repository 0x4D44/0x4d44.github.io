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

const article = articles.find((item) => item.id === "voices-plan-a-serious-plan-incomplete-proof");
assert.ok(article, "Plan A opinion article should be present");
assert.equal(article.category, "Voices");
assert.ok(article.body.length >= 20, "opinion should retain its long-form structure");

const wordCount = article.body.join(" ").trim().split(/\s+/).length;
assert.ok(wordCount >= 1800, `expected a long-form article, found ${wordCount} words`);
assert.match(article.notice, /real M&S ESG Report 2026/);
assert.match(article.imageCaption, /AI-generated/);

assert.equal(article.images.length, 3, "article should include one inline illustration and two graphs");
for (const image of article.images) {
  assert.ok(image.alt && image.caption, `${image.src} needs accessible copy`);
  assert.ok(Number.isInteger(image.afterParagraph), `${image.src} needs a paragraph position`);
  assert.ok(image.afterParagraph >= 0 && image.afterParagraph < article.body.length);
  assert.ok(fs.existsSync(path.join(newsDir, image.src)), `${image.src} should exist`);
}
assert.ok(fs.existsSync(path.join(newsDir, article.image)), "hero image should exist");

for (const chartName of ["voices-plan-a-emissions.svg", "voices-plan-a-targets.svg"]) {
  const chart = fs.readFileSync(path.join(newsDir, "images", chartName), "utf8");
  assert.match(chart, /<title id="title">/);
  assert.match(chart, /<desc id="desc">/);
  assert.match(chart, /M&amp;S ESG Report 2026/);
}

assert.match(rendererSource, /a\.imageCaption/);
assert.match(rendererSource, /a\.notice/);
assert.match(rendererSource, /Opinion note:/);

console.log(`Daily Flange Plan A static validation passed (${wordCount} words).`);
