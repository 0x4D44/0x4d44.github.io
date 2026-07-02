import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chapters, allPhrases, allSigns } from "../content.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const report = {
  builtAt: new Date().toISOString(),
  app: "Nihon Quest",
  static: true,
  chapters: chapters.length,
  phrases: allPhrases().length,
  signs: allSigns().length,
  files: []
};
for (const name of ["index.html", "styles.css", "app.js", "content.js", "engines.js", "manifest.webmanifest", "sw.js", "icons/icon.svg"]) {
  const full = path.join(root, name);
  if (!fs.existsSync(full)) throw new Error(`Missing static asset: ${name}`);
  const size = fs.statSync(full).size;
  if (size <= 0) throw new Error(`Empty static asset: ${name}`);
  report.files.push({ name, size });
}
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
for (const ref of ["styles.css", "app.js", "manifest.webmanifest"]) {
  if (!html.includes(ref)) throw new Error(`index.html does not reference ${ref}`);
}
fs.writeFileSync(path.join(root, "build-report.json"), JSON.stringify(report, null, 2) + "\n");
console.log(`PASS build: static app validated (${report.chapters} chapters, ${report.phrases} phrases, ${report.signs} signs).`);
