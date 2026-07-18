import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const newsDir = path.resolve(here, "..");
const articlesSource = fs.readFileSync(path.join(newsDir, "articles.js"), "utf8");
const adsSource = fs.readFileSync(path.join(newsDir, "ads.js"), "utf8");
const rendererSource = fs.readFileSync(path.join(newsDir, "news.js"), "utf8");
const context = { window: {} };

vm.runInNewContext(articlesSource, context, { filename: "articles.js" });
vm.runInNewContext(adsSource, context, { filename: "ads.js" });

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

const ai2027WordCount = validateLongForm({
  id: "voices-ai-2027-fire-drill-not-timetable",
  minimumWords: 2600,
  inlineImages: 5,
  noticePattern: /real AI Futures Project report AI 2027/,
});

const aiComparisonWordCount = validateLongForm({
  id: "voices-ai-2027-plan-a-tripwires-playbook",
  minimumWords: 2600,
  inlineImages: 5,
  noticePattern: /real AI Futures Project reports AI 2027/,
});

const chartSources = new Map([
  ["voices-plan-a-emissions.svg", /M&amp;S ESG Report 2026/],
  ["voices-plan-a-targets.svg", /M&amp;S ESG Report 2026/],
  ["voices-ai-plan-a-compute.svg", /AI Futures Project/],
  ["voices-ai-plan-a-confidence.svg", /AI Futures Project/],
  ["voices-ai-plan-a-work.svg", /AI Futures Project/],
  ["voices-ai-2027-rd-loop.svg", /AI Futures Project/],
  ["voices-ai-2027-milestones.svg", /AI Futures Project/],
  ["voices-ai-2027-forecast-range.svg", /AI Futures Project/],
  ["voices-ai-scenarios-timelines.svg", /AI Futures Project/],
  ["voices-ai-scenarios-design.svg", /AI Futures Project/],
  ["voices-ai-scenarios-tripwires.svg", /AI 2027 forecasts and AI 2040/],
]);

for (const [chartName, sourcePattern] of chartSources) {
  const chart = fs.readFileSync(path.join(newsDir, "images", chartName), "utf8");
  assert.match(chart, /<title id="title">/);
  assert.match(chart, /<desc id="desc">/);
  assert.match(chart, sourcePattern);
}

assert.match(rendererSource, /a\.imageCaption/);
assert.match(rendererSource, /a\.notice/);
assert.match(rendererSource, /a\.noticeLabel \|\| "Opinion note"/);
assert.equal(
  articles.find((item) => item.id === "voices-plan-a-serious-plan-incomplete-proof").noticeLabel,
  undefined,
  "existing opinion articles should use the default notice label",
);

const saucepanIds = [
  "life-saucepan-bottom-worn-support",
  "eng-worn-copper-bottom-repair-guide",
  "hea-saucepan-wear-trauma-hotline",
  "life-restored-copper-pan-homecoming",
];

for (const id of saucepanIds) {
  const saucepanArticle = articles.find((item) => item.id === id);
  assert.ok(saucepanArticle, `${id} should be present`);
  assert.ok(saucepanArticle.body.length >= 10, `${id} should retain detailed reporting`);
  const saucepanWords = saucepanArticle.body.join(" ").trim().split(/\s+/).length;
  assert.ok(saucepanWords >= 550, `${id} should be detailed, found ${saucepanWords} words`);
  assert.ok(saucepanArticle.imageAlt && saucepanArticle.imageCaption, `${id} needs accessible hero copy`);
  assert.ok(fs.existsSync(path.join(newsDir, saucepanArticle.image)), `${saucepanArticle.image} should exist`);

  for (const inlineImage of saucepanArticle.images || []) {
    assert.ok(inlineImage.alt && inlineImage.caption, `${inlineImage.src} needs accessible copy`);
    assert.ok(Number.isInteger(inlineImage.afterParagraph), `${inlineImage.src} needs a paragraph position`);
    assert.ok(inlineImage.afterParagraph >= 0 && inlineImage.afterParagraph < saucepanArticle.body.length);
    assert.ok(fs.existsSync(path.join(newsDir, inlineImage.src)), `${inlineImage.src} should exist`);
  }
}

const repairGuide = articles.find((item) => item.id === "eng-worn-copper-bottom-repair-guide");
assert.equal(repairGuide.images.length, 2, "repair guide should include the decision guide and professional re-tinning image");
assert.match(repairGuide.body.join(" "), /Re-tinning repairs the latter\. It does not recreate the former\./);
assert.match(repairGuide.body.join(" "), /Do not fill a gap with epoxy/);
assert.equal(repairGuide.noticeLabel, "Safety note");
assert.match(repairGuide.notice, /qualified restorer/);

const saucepanAdHeadlines = [
  "HAS YOUR BOTTOM GONE?",
  "BOTTOMBACK™ SAUCEPAN COVER",
  "RE-COPPER IT YOURSELF! (DO NOT)",
  "THE MEMORIAL TRIVET",
];
for (const headline of saucepanAdHeadlines) {
  const ad = context.window.NEWS_ADS.find((item) => item.headline === headline);
  assert.ok(ad, `${headline} advert should be present`);
  assert.ok(ad.body && ad.cta && ad.href, `${headline} advert should be complete`);
}

const sportSections = {
  Football: 6,
  Cricket: 4,
  Olympics: 7,
  Tennis: 3,
  Athletics: 2,
  "Other Sports": 10,
  Motorsport: 50,
};
for (const [section, expectedCount] of Object.entries(sportSections)) {
  assert.equal(
    articles.filter((article) => article.category === section).length,
    expectedCount,
    section + " should contain " + expectedCount + " sporting stories",
  );
}
const groupedSportArticles = articles.filter((article) => article.id.startsWith("spt-"));
assert.equal(groupedSportArticles.length, 32, "all prefixed sports stories should remain in the corpus");
assert.ok(
  groupedSportArticles.every((article) => Object.hasOwn(sportSections, article.category)),
  "every prefixed sports story should belong to a Sport subcategory",
);
const motorsportArticles = articles.filter((article) => article.id.startsWith("mot-"));
assert.equal(motorsportArticles.length, 50, "the Motorsport desk should contain 50 real-incident stories");
for (const article of motorsportArticles) {
  assert.equal(article.category, "Motorsport", `${article.id} should stay on the Motorsport desk`);
  assert.ok(Array.isArray(article.body), `${article.id} body should use the renderer's paragraph-array schema`);
  assert.ok(article.body.length >= 3, `${article.id} should explain the incident in at least three paragraphs`);
  assert.equal(article.noticeLabel, "Based on a true story", `${article.id} should identify its factual basis`);
  assert.ok(Array.isArray(article.sources) && article.sources.length >= 1, `${article.id} should retain source provenance`);
  for (const source of article.sources) {
    assert.match(source, /^https:\/\//, `${article.id} source should be an HTTPS URL`);
  }
  assert.ok(article.image.startsWith("images/mot-"), `${article.id} should use a dedicated Motorsport image`);
  assert.ok(article.imageAlt, `${article.id} image needs accessible alt text`);
  assert.match(article.imageCaption, /AI-generated/, `${article.id} should disclose its generated illustration`);
  assert.ok(fs.existsSync(path.join(newsDir, article.image)), `${article.image} should exist`);
}
assert.equal(
  articles.filter((article) => article.category === "Sport").length,
  0,
  "Sport should be a parent desk, not a catch-all article category",
);

vm.runInNewContext(rendererSource, context, { filename: "news.js" });
for (const article of motorsportArticles) {
  const articleMount = { innerHTML: "" };
  context.location = { search: `?id=${encodeURIComponent(article.id)}` };
  context.document = {
    title: "",
    getElementById: () => articleMount,
    querySelector: () => null,
  };
  assert.doesNotThrow(
    () => context.window.NEWS.renderArticle("app"),
    `${article.id} should render as a complete article page`,
  );
  assert.match(articleMount.innerHTML, new RegExp(article.headline.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
}
const sportNav = context.window.NEWS.header("Football");
assert.match(sportNav, />Sport <span class="chev"/);
assert.match(sportNav, /search\.html\?cat=Sport[^>]*>All Sport<\/a>/);
for (const section of Object.keys(sportSections)) {
  assert.match(sportNav, new RegExp("search\\.html\\?cat=" + encodeURIComponent(section)));
}
const sportMount = { innerHTML: "" };
context.location = { search: "?cat=Sport" };
context.document = {
  title: "",
  getElementById: () => sportMount,
  querySelector: () => null,
};
context.window.NEWS.renderSearch("app");
assert.match(
  sportMount.innerHTML,
  /82 stories across Football, Cricket, Olympics, Tennis, Athletics, Other Sports, Motorsport/,
);

assert.equal(articles.length, 842, "catalog copy and article corpus count should stay in lockstep");

console.log(`Daily Flange static validation passed (${articles.length} articles; four saucepan features).`);
