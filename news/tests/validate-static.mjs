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
const stylesheetSource = fs.readFileSync(path.join(newsDir, "news.css"), "utf8");
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

const managementArticles = articles.filter((article) => article.id.startsWith("mgmt-"));
assert.equal(managementArticles.length, 50, "the Middle Management desk should contain 50 career-limiting mishaps");
assert.equal(new Set(managementArticles.map((article) => article.image)).size, 50, "each management mishap needs distinct artwork");
for (const article of managementArticles) {
  assert.equal(article.category, "Middle Management", `${article.id} should stay on the Middle Management desk`);
  assert.ok(Array.isArray(article.body) && article.body.length >= 4, `${article.id} should tell a complete four-part story`);
  assert.equal(article.noticeLabel, "Career selection notice", `${article.id} should label its fictional framing`);
  assert.match(article.notice, /fiction/i, `${article.id} should clearly identify itself as fictional satire`);
  assert.ok(article.image.startsWith("images/mgmt-"), `${article.id} should use management-series artwork`);
  assert.ok(article.imageAlt, `${article.id} image needs accessible alt text`);
  assert.match(article.imageCaption, /AI-generated/, `${article.id} should disclose its generated illustration`);
  assert.ok(fs.existsSync(path.join(newsDir, article.image)), `${article.image} should exist`);
}

const topTenArticles = articles.filter((article) => article.id.startsWith("top10-"));
assert.equal(topTenArticles.length, 10, "the rankings desk should contain ten preposterous top-ten articles");
assert.equal(new Set(topTenArticles.map((article) => article.image)).size, 10, "each top-ten article needs distinct artwork");
for (const article of topTenArticles) {
  assert.equal(article.body.length, 12, `${article.id} should contain an introduction, ten entries and a conclusion`);
  const ranks = Array.from(article.body.slice(1, 11), (paragraph) => Number.parseInt(paragraph, 10));
  assert.deepEqual(ranks, [10, 9, 8, 7, 6, 5, 4, 3, 2, 1], `${article.id} should rank all ten entries`);
  assert.ok(article.image.startsWith("images/top10-"), `${article.id} should use rankings artwork`);
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
assert.match(rendererSource, /function isMobileNav\(\)/, "navigation should have a mobile layout branch");
assert.match(rendererSource, /Open sections menu/, "mobile navigation should expose an accessible menu label");
assert.match(stylesheetSource, /\.catnav-more-menu\.open[\s\S]*overflow-y:\s*auto/, "mobile menu should own vertical scrolling");
for (const article of [...motorsportArticles, ...managementArticles, ...topTenArticles]) {
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

const managementNav = context.window.NEWS.header("Middle Management");
assert.match(managementNav, />Business <span class="chev"/);
assert.match(managementNav, /search\.html\?cat=Business[^>]*>All Business<\/a>/);
assert.match(managementNav, /search\.html\?cat=Middle%20Management/);

assert.equal(articles.length, 903, "catalog copy and article corpus count should stay in lockstep");

// ALM-BUG-KILN-00020: a stray/truncated percent-escape in ?id= or ?q= must degrade to
// the graceful path, not throw URIError and blank the page.
for (const search of ["?id=%", "?q=100%", "?id=%E0%A4%A", "?cat=%"]) {
  const mount = { innerHTML: "" };
  context.location = { search };
  context.document = { title: "", getElementById: () => mount, querySelector: () => null };
  assert.doesNotThrow(() => context.window.NEWS.renderArticle("app"), `renderArticle should survive ${search}`);
  assert.doesNotThrow(() => context.window.NEWS.renderSearch("app"), `renderSearch should survive ${search}`);
}

// ALM-BUG-KILN-00024: the masthead weekday and date must come from one clock. Simulate a
// moment where the local day is ahead of the UTC calendar date (local Tue 14 Jul 23:30,
// UTC still Mon 13 Jul) and assert the printed weekday matches the printed date.
{
  const RealDate = Date;
  class FakeDate {
    getFullYear() { return 2026; } getMonth() { return 6; } getDate() { return 14; }
    getDay() { return 2; } getTime() { return RealDate.UTC(2026, 6, 13, 22, 30); }
    toISOString() { return "2026-07-13T22:30:00.000Z"; }
  }
  context.Date = FakeDate;
  const head = context.window.NEWS.header("");
  context.Date = RealDate;
  const m = head.match(/(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday), (\d{2}) (\w{3}) (\d{4})/);
  assert.ok(m, "masthead should print a weekday and date");
  const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const printed = new RealDate(RealDate.UTC(+m[4], MON.indexOf(m[3]), +m[2]));
  const weekday = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][printed.getUTCDay()];
  assert.equal(m[1], weekday, `masthead weekday ${m[1]} must match its date ${m[2]} ${m[3]} ${m[4]} (${weekday})`);
}

// ALM-BUG-KILN-00019: if articles.js/ads.js fail to load (coerced to []), the page must
// degrade to a friendly notice, not throw on the unguarded head reads and blank #app.
{
  const emptyCtx = { window: { NEWS_ARTICLES: [], NEWS_ADS: [] } };
  vm.runInNewContext(rendererSource, emptyCtx, { filename: "news.js" });
  const mount = { innerHTML: "" };
  emptyCtx.location = { search: "" };
  emptyCtx.document = { title: "", getElementById: () => mount, querySelector: () => null };
  assert.doesNotThrow(() => emptyCtx.window.NEWS.renderHome("app"), "renderHome should survive an empty corpus");
  assert.match(mount.innerHTML, /Nothing to show/, "an empty corpus should degrade to a friendly notice");
}

// ALM-BUG-KILN-00027: a shape-invalid article must be skipped, not blank whole pages.
// (a) corpus-shape oracle: every shipped article is well-formed.
for (const a of articles) {
  for (const field of ["id", "category", "headline", "standfirst"]) {
    assert.ok(typeof a[field] === "string" && a[field].length > 0,
      `article ${a.id || "(no id)"} needs a non-empty string ${field}`);
  }
  assert.ok(Array.isArray(a.body) && a.body.length > 0, `article ${a.id} needs a non-empty body`);
}
// (b) a fat-fingered append (missing category/headline/standfirst) is skipped at load and
// the search/about pages still render.
{
  const badArticles = articles.concat([{ id: "x-malformed", body: ["only a body, no category/headline/standfirst"] }]);
  const badCtx = { window: { NEWS_ARTICLES: badArticles, NEWS_ADS: context.window.NEWS_ADS } };
  vm.runInNewContext(rendererSource, badCtx, { filename: "news.js" });
  assert.equal(badCtx.window.NEWS.count(), articles.length, "the malformed article should be dropped at load");
  for (const [search, fn] of [["?q=anything", "renderSearch"], ["?cat=Science", "renderSearch"], ["", "renderAbout"]]) {
    const mount = { innerHTML: "" };
    badCtx.location = { search };
    badCtx.document = { title: "", getElementById: () => mount, querySelector: () => null };
    assert.doesNotThrow(() => badCtx.window.NEWS[fn]("app"), `${fn} should survive a malformed article at ${search || "(about)"}`);
  }
}

// ALM-BUG-KILN-00026: no story in the homepage MAIN column (hero/lead/more-top/feature
// bands/Around) may appear twice — the category bands must exclude ids already placed. The
// ticker and "Most read" sidebar are intentionally separate, so we scope to <main>…</main>.
{
  const RealDate = Date;
  const fake = (ms) => class {
    getTime() { return ms; }
    getFullYear() { return new RealDate(ms).getUTCFullYear(); }
    getMonth() { return new RealDate(ms).getUTCMonth(); }
    getDate() { return new RealDate(ms).getUTCDate(); }
    getDay() { return new RealDate(ms).getUTCDay(); }
    toISOString() { return new RealDate(ms).toISOString(); }
  };
  for (let s = 0; s < 24; s++) {
    const mount = { innerHTML: "" };
    context.Date = fake(1_000_000 * 3600000 + s * 3600000); // distinct hour seeds
    context.location = { search: "" };
    context.document = { title: "", getElementById: () => mount, querySelector: () => null };
    context.window.NEWS.renderHome("app");
    const main = mount.innerHTML.slice(mount.innerHTML.indexOf("<main>"), mount.innerHTML.indexOf("</main>"));
    // Each card links its story twice (image + headline), adjacent — collapse those runs so
    // we only flag a story that reappears in a DIFFERENT section.
    const ids = [...main.matchAll(/article\.html\?id=([^"&]+)/g)].map((m) => m[1])
      .filter((id, i, arr) => id !== arr[i - 1]);
    const dup = ids.find((id, i) => ids.indexOf(id) !== i);
    assert.equal(dup, undefined, `homepage main column repeats story ${dup} at hour-seed offset ${s}`);
  }
  context.Date = RealDate;
}

// ALM-BUG-KILN-00021: search highlighting must not corrupt escaped entities or its own
// <mark> tags. Highlighting on the raw text (escaping each span) fixes both.
{
  const probeArticles = [
    { id: "t-amp", category: "Science", headline: "Fish & Chips amp-hour", standfirst: "n", body: ["b"], published: "2026-01-01" },
    { id: "t-mark", category: "Science", headline: "a market opens", standfirst: "n", body: ["b"], published: "2026-01-01" },
  ];
  const probeCtx = { window: { NEWS_ARTICLES: probeArticles, NEWS_ADS: [] } };
  vm.runInNewContext(rendererSource, probeCtx, { filename: "news.js" });
  const render = (q) => {
    const mount = { innerHTML: "" };
    probeCtx.location = { search: "?q=" + encodeURIComponent(q) };
    probeCtx.document = { title: "", getElementById: () => mount, querySelector: () => null };
    probeCtx.window.NEWS.renderSearch("app");
    return mount.innerHTML;
  };
  const ampOut = render("amp");
  assert.doesNotMatch(ampOut, /&<mark>amp<\/mark>;/, "highlight must not tear open the &amp; entity");
  assert.match(ampOut, /Fish &amp; Chips/, "the & entity must stay intact");
  const markOut = render("a mar");
  assert.doesNotMatch(markOut, /<<mark>|<\/mark>k>/, "highlight must not re-match inside/around an inserted <mark> tag");
  assert.equal((markOut.match(/<mark>/g) || []).length, (markOut.match(/<\/mark>/g) || []).length,
    "every <mark> must have a matching </mark>");
}

// ALM-BUG-KILN-00018: a based-on-truth article must NOT tell the reader it "never happened".
// The notice and footer must acknowledge the real event; a plain satire story is unchanged.
{
  const renderArticleHtml = (id) => {
    const mount = { innerHTML: "" };
    context.location = { search: `?id=${encodeURIComponent(id)}` };
    context.document = { title: "", getElementById: () => mount, querySelector: () => null };
    context.window.NEWS.renderArticle("app");
    return mount.innerHTML;
  };
  const bot = articles.find((a) => (a.tags || []).includes("based-on-truth") && !a.notice);
  assert.ok(bot, "corpus should contain a based-on-truth article without a custom notice");
  const botHtml = renderArticleHtml(bot.id);
  assert.doesNotMatch(botHtml, /never happened/, `${bot.id} must not claim the real event never happened`);
  assert.doesNotMatch(botHtml, /Nothing here is true/, `${bot.id} footer must not assert total fiction`);
  assert.match(botHtml, /underlying event really happened/, `${bot.id} should acknowledge the real event`);

  const plain = articles.find((a) => !(a.tags || []).includes("based-on-truth") && !a.notice);
  const plainHtml = renderArticleHtml(plain.id);
  assert.match(plainHtml, /never happened/, `${plain.id} (pure satire) should keep the satire notice`);
  assert.match(plainHtml, /Nothing here is true/, `${plain.id} footer should keep the fiction disclaimer`);
}

// ALM-BUG-KILN-00022: article bodies must not carry model-guardrail phrasing that reads as
// a generation artifact rather than editorial voice.
{
  const guardrail = /\ba fictitious\b|\bas an AI\b|\bas a language model\b|\bI'm sorry,? but I (?:can|cannot|won't)\b/i;
  const offenders = [];
  for (const a of articles) {
    for (const [i, p] of (a.body || []).entries()) {
      if (typeof p === "string" && guardrail.test(p)) offenders.push(`${a.id} para ${i}`);
    }
  }
  assert.deepEqual(offenders.slice(0, 10), [], `${offenders.length} body paragraph(s) carry LLM-guardrail phrasing: ${offenders.slice(0, 10).join(", ")}`);
}

console.log(`Daily Flange static validation passed (${articles.length} articles; four saucepan features).`);
