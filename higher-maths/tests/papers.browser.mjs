// Browser smoke test for papers.html: tabs, typed answers, auto-marking, persistence, mocks and the phone layout.
// Needs a static server on the repo root:  python3 -m http.server 8000   then   node higher-maths/tests/papers.browser.mjs
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_PATH || "playwright");
import assert from "node:assert/strict";

const BASE = process.env.BASE || "http://localhost:8000/higher-maths/papers.html";
const browser = await chromium.launch();
let failed = 0;
const step = async (name, fn) => { try { await fn(); console.log("ok  ", name); } catch (e) { failed++; console.log("FAIL", name, "\n    ", e.message.split("\n")[0]); } };

for (const [w, h] of [[1100, 900], [390, 844]]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  await page.goto(BASE);
  await page.waitForSelector(".pp-tabs [role=tab]");

  await step(`${w}: six tabs, first selected, nothing scrolls sideways, no raw TeX or KaTeX errors`, async () => {
    assert.equal(await page.locator(".pp-tabs [role=tab]").count(), 6);
    assert.equal(await page.locator('.pp-tabs [aria-selected="true"]').count(), 1);
    for (const t of ["alg", "geo", "trig", "cal", "mock", "score"]) {
      await page.click(`#pp-tab-${t}`);
      const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      assert.ok(over <= 1, `${t}: ${over}px sideways overflow`);
      assert.equal(await page.locator(`#pp-panel-${t}`).isVisible(), true);
      if (t !== "score") {
        assert.equal(await page.locator(`#pp-panel-${t} .katex-error`).count(), 0, `${t}: a KaTeX error`);
        const raw = await page.evaluate((id) => [...document.querySelectorAll(`#pp-panel-${id} .pp-stem, #pp-panel-${id} .pp-pq`)].filter((n) => /\$[^$]+\$/.test(n.textContent)).length, t);
        assert.equal(raw, 0, `${t}: untypeset $...$ left in the page`);
      }
    }
  });

  await step(`${w}: arrow keys move between tabs`, async () => {
    await page.click("#pp-tab-alg");
    await page.keyboard.press("ArrowRight");
    assert.equal(await page.getAttribute("#pp-tab-geo", "aria-selected"), "true");
    await page.keyboard.press("End");
    assert.equal(await page.getAttribute("#pp-tab-score", "aria-selected"), "true");
  });

  await step(`${w}: a typed answer is marked right and wrong, can be redone, and an unreadable one is not counted`, async () => {
    await page.click("#pp-tab-alg");
    const part = page.locator("#pp-panel-alg .pp-part:has(input.pp-num)").first();
    await part.locator("input.pp-num").first().fill("(((");
    await part.getByRole("button", { name: "Mark my answer" }).click();
    assert.equal(await part.locator(".pp-err").isVisible(), true, "unreadable answer gives a message");
    assert.equal(await part.locator(".pp-score").count(), 0, "and is not marked");
    await part.locator("input.pp-num").first().fill("999999");
    await part.getByRole("button", { name: "Mark my answer" }).click();
    assert.match(await part.locator(".pp-score").innerText(), /^0 \//);
    assert.equal(await part.locator(".pp-model").count(), 1, "worked solution shown");
    await part.getByRole("button", { name: /Try again/ }).click();
    assert.equal(await part.locator("input.pp-num").first().inputValue(), "");
  });

  await step(`${w}: the model answer typed into a part earns full marks and survives a reload`, async () => {
    const key = await page.evaluate(() => {
      const q = window.HMP_BANK.alg.questions.find((x) => x.parts[0].type === "num" || x.parts[0].type === "expr");
      return { id: q.id, a: window.HMP.modelAnswer(q.parts[0]), marks: q.parts[0].marks };
    });
    await page.click("#pp-tab-alg");
    const part = page.locator(`#alg-${key.id} .pp-part`).first();
    await part.locator("input.pp-num").first().fill(String(key.a));
    await part.getByRole("button", { name: "Mark my answer" }).click();
    assert.match(await part.locator(".pp-score").innerText(), new RegExp(`^${key.marks} / ${key.marks}`));
    await page.reload();
    await page.waitForSelector(".pp-tabs [role=tab]");
    await page.click("#pp-tab-alg");
    const again = page.locator(`#alg-${key.id} .pp-part`).first();
    assert.match(await again.locator(".pp-score").innerText(), new RegExp(`^${key.marks} / ${key.marks}`), "marked again after reload");
    await page.click("#pp-tab-score");
    assert.match(await page.locator("#pp-panel-score").innerText(), /Algebra/);
  });

  await step(`${w}: both mock papers draw the right marks, split calculator / non-calculator, with a clock`, async () => {
    await page.click("#pp-tab-mock");
    for (const [name, calc, lo, hi] of [["Paper 1", "non-calculator", 26, 30], ["Paper 2", "calculator", 30, 34]]) {
      await page.getByRole("button", { name: new RegExp(name) }).click();
      const tags = await page.locator("#pp-panel-mock .pp-qtag").allInnerTexts();
      assert.ok(tags.length >= 4, `${name}: ${tags.length} questions`);
      assert.ok(tags.every((t) => t.includes(calc)), `${name}: every question is ${calc}`);
      const marks = tags.reduce((s, t) => s + +/(\d+) marks/.exec(t)[1], 0);
      assert.ok(marks >= lo && marks <= hi, `${name}: ${marks} marks`);
      assert.equal(await page.locator("#pp-panel-mock .exam-timer:visible").count(), 1, `${name}: one clock showing`);
    }
  });

  await step(`${w}: no page errors`, async () => { assert.deepEqual(errors, []); });
  await ctx.close();
}
await browser.close();
if (failed) { console.log(`${failed} failed`); process.exit(1); }
console.log("all passed");
