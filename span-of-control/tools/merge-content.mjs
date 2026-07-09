// Dev tool (not shipped): splice generated card/homily/ending JSON from
// ../../tmp-content/*.json into content.js at the three marker comments.
// Idempotence is on the caller: run once per batch, then delete tmp-content.
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { dirname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { CARDS, HOMILIES, ENDINGS } from "../content.js";

const here = dirname(fileURLToPath(import.meta.url));
const contentPath = normalize(join(here, "..", "content.js"));
const tmpDir = normalize(join(here, "..", "..", "tmp-content"));

const MARKERS = {
  cards: "  // === generated cards are spliced in above this marker ===",
  homilies: "  // === generated homilies are spliced in above this marker ===",
  endings: "  // === generated endings are spliced in above this marker ===",
};

const existingIds = new Set([
  ...CARDS.map((c) => c.id),
  ...HOMILIES.map((h) => h.id),
  ...ENDINGS.map((e) => e.id),
]);

const batches = readdirSync(tmpDir).filter((f) => f.endsWith(".json")).sort();
if (!batches.length) {
  console.error(`no *.json batches in ${tmpDir}`);
  process.exit(1);
}

const add = { cards: [], homilies: [], endings: [] };
const problems = [];
for (const file of batches) {
  const data = JSON.parse(readFileSync(join(tmpDir, file), "utf8"));
  for (const key of ["cards", "homilies", "endings"]) {
    for (const item of data[key] || []) {
      if (!item.id) { problems.push(`${file}: ${key} item without id`); continue; }
      if (existingIds.has(item.id)) { problems.push(`${file}: duplicate id ${item.id}`); continue; }
      existingIds.add(item.id);
      add[key].push(item);
    }
  }
  console.log(`${file}: +${(data.cards || []).length} cards, +${(data.homilies || []).length} homilies, +${(data.endings || []).length} endings`);
}
if (problems.length) {
  for (const p of problems) console.error("PROBLEM: " + p);
  process.exit(1);
}

function serialize(items) {
  return items
    .map((item) => {
      const json = JSON.stringify(item, null, 2)
        .split("\n")
        .map((line) => "  " + line)
        .join("\n");
      return json + ",";
    })
    .join("\n") + "\n";
}

let source = readFileSync(contentPath, "utf8");
for (const key of ["cards", "homilies", "endings"]) {
  if (!add[key].length) continue;
  const marker = MARKERS[key];
  if (!source.includes(marker)) {
    console.error(`marker missing for ${key}`);
    process.exit(1);
  }
  source = source.replace(marker, serialize(add[key]) + marker);
}
writeFileSync(contentPath, source);
console.log(`merged: +${add.cards.length} cards, +${add.homilies.length} homilies, +${add.endings.length} endings -> content.js`);
