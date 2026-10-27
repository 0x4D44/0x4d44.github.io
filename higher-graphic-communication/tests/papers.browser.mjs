// Browser smoke test for papers.html: tabs, answering, auto-marking, the scoreboard and the phone layout.
// Needs a static server on the repo root:  python3 -m http.server 8000   then   node higher-graphic-communication/tests/papers.browser.mjs
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_PATH || "playwright");
import assert from "node:assert/strict";

const BASE = process.env.BASE || "http://localhost:8000/higher-graphic-communication/papers.html";
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

  await step(`${w}: seven tabs, first selected, nothing scrolls sideways`, async () => {
    assert.equal(await page.locator(".pp-tabs [role=tab]").count(), 7);
    assert.equal(await page.locator('.pp-tabs [aria-selected="true"]').count(), 1);
    for (const t of ["dtp", "cad", "interp", "std", "tech", "mock", "score"]) {
      await page.click(`#pp-tab-${t}`);
      const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      assert.ok(over <= 1, `${t}: ${over}px sideways overflow`);
      assert.equal(await page.locator(`#pp-panel-${t}`).isVisible(), true);
    }
  });

  await step(`${w}: arrow keys move between tabs`, async () => {
    await page.click("#pp-tab-dtp");
    await page.keyboard.press("ArrowRight");
    assert.equal(await page.getAttribute("#pp-tab-cad", "aria-selected"), "true");
    await page.keyboard.press("End");
    assert.equal(await page.getAttribute("#pp-tab-score", "aria-selected"), "true");
  });

  await step(`${w}: a multiple-choice part marks right and wrong`, async () => {
    await page.click("#pp-tab-dtp");
    const part = page.locator("#pp-panel-dtp .pp-part:has(.pp-opts)").first();
    await part.locator("input").first().check();
    await part.getByRole("button", { name: "Mark my answer" }).click();
    assert.ok(await part.locator(".pp-score").isVisible());
    assert.ok(await part.locator(".pp-opt.right").count() >= 1);
    await part.getByRole("button", { name: /Try again/ }).click();
    assert.equal(await part.locator(".pp-score").count(), 0);
  });

  await step(`${w}: a written part can be marked and corrected by hand`, async () => {
    const part = page.locator("#pp-panel-dtp .pp-part:has(textarea)").first();
    await part.locator("textarea").fill("I think it looks nice and the colours are good");
    await part.getByRole("button", { name: "Mark my answer" }).click();
    assert.match(await part.locator(".pp-score").innerText(), /\/ \d+ mark/);
    const boxes = part.locator(".pp-points input");
    assert.ok(await boxes.count() >= 2);
    await boxes.first().check();
    assert.match(await part.locator(".pp-score").innerText(), /^1 \//);
  });

  await step(`${w}: the scoreboard and the mock paper pick the marks up`, async () => {
    await page.click("#pp-tab-score");
    assert.match(await page.locator("#pp-panel-score .pp-verdict").innerText(), /earned/);
    await page.click("#pp-tab-mock");
    assert.ok(await page.locator("#pp-panel-mock .pp-q").count() >= 6);
    await page.getByRole("button", { name: /Draw a new mock paper/ }).click();
    assert.ok(await page.locator("#pp-panel-mock .timer-face").count() === 1);
  });

  await step(`${w}: no page errors`, async () => assert.deepEqual(errors, []));
  await ctx.close();
}
await browser.close();
process.exit(failed ? 1 : 0);
