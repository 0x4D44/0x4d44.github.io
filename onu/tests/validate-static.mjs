// Static acceptance checks for Onu's zero-build browser shell.
// Rule behaviour belongs in engine.test.mjs; real interaction belongs in
// browser.test.mjs. This file protects the semantic wiring between them.

import { existsSync, readFileSync } from "node:fs";
import { dirname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const appDir = normalize(join(here, ".."));
const root = normalize(join(appDir, ".."));
const htmlPath = join(appDir, "index.html");
const enginePath = join(appDir, "engine.mjs");
const appPath = join(appDir, "app.mjs");
const failures = [];
let checks = 0;

function check(condition, message) {
  checks += 1;
  if (!condition) failures.push(message);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function openingTagWithId(source, id) {
  const escaped = escapeRegExp(id);
  return source.match(new RegExp(`<([a-z][\\w:-]*)\\b(?=[^>]*\\bid=["']${escaped}["'])[^>]*>`, "i"));
}

function attribute(tag, name) {
  if (!tag) return null;
  const escaped = escapeRegExp(name);
  return tag[0].match(new RegExp(`\\b${escaped}\\s*=\\s*["']([^"']*)["']`, "i"))?.[1] ?? null;
}

function isButton(source, id) {
  return openingTagWithId(source, id)?.[1]?.toLowerCase() === "button";
}

function hasAccessibleName(source, id) {
  const tag = openingTagWithId(source, id);
  return Boolean(attribute(tag, "aria-label") || attribute(tag, "aria-labelledby"));
}

check(existsSync(htmlPath), "index.html exists");
check(existsSync(enginePath), "engine.mjs exists");
check(existsSync(appPath), "app.mjs exists");

const html = existsSync(htmlPath) ? readFileSync(htmlPath, "utf8") : "";
const engine = existsSync(enginePath) ? readFileSync(enginePath, "utf8") : "";
const app = existsSync(appPath) ? readFileSync(appPath, "utf8") : "";
const browserSource = `${html}\n${app}`;

// Document identity and the local, zero-build module boundary.
check(/<meta\b[^>]*name=["']viewport["']/i.test(html), "viewport meta is present");
check(/<title>[^<]*\bOnu\b[^<]*<\/title>/i.test(html), "document title identifies Onu");
// A private sound key is not displayed; every other spelling is part of the
// shipped page source and must use the renamed product/call.
const brandingSurface = html
  .replace(/\bcase\s+["']uno["']/gi, "")
  .replace(/\bsnd\(\s*["']uno["']/gi, "");
check(!/\bUNO\b/i.test(brandingSurface), "shipped page uses Onu branding, never UNO");

const moduleScripts = [...html.matchAll(/<script\b([^>]*)>/gi)]
  .map((match) => match[1])
  .filter((attrs) => /\btype\s*=\s*["']module["']/i.test(attrs));
check(
  moduleScripts.some((attrs) => /\bsrc\s*=\s*["']\.\/app\.mjs["']/i.test(attrs)) && /from\s+["']\.\/engine\.mjs["']/i.test(app),
  "index loads local app.mjs, which imports engine.mjs",
);
check(!/\b(?:from\s*|import\s*\()\s*["'`](?:https?:)?\/\//i.test(engine), "engine has no external module dependency");

// One explicit, accessible mode chooser with exactly the three signed-off modes.
const chooser = openingTagWithId(html, "modeChooser");
check(Boolean(chooser), "#modeChooser is present");
check(
  Boolean(attribute(chooser, "aria-label") || attribute(chooser, "aria-labelledby")),
  "#modeChooser has an accessible label",
);
const modeButtons = [...html.matchAll(/<button\b[^>]*\bdata-mode\s*=\s*["']([^"']+)["'][^>]*>/gi)];
const modes = modeButtons.map((match) => match[1]);
check(modeButtons.length === 3, "mode chooser exposes exactly three mode buttons");
check(
  modes.length === 3 && new Set(modes).size === 3 && ["classic", "flip", "chaos"].every((mode) => modes.includes(mode)),
  "mode buttons are exactly classic, flip, and chaos",
);
check(modeButtons.every((match) => /\baria-pressed\s*=\s*["'](?:true|false)["']/i.test(match[0])), "mode buttons expose selected state with aria-pressed");

// Stable action hooks. Icon-only controls need an explicit accessible name.
for (const [id, label] of [
  ["newBtn", "new match"],
  ["rulesBtn", "rules"],
  ["sndBtn", "sound"],
]) {
  check(isButton(html, id), `#${id} is a native button for ${label}`);
  check(hasAccessibleName(html, id), `#${id} has an accessible ${label} name`);
}

for (const [id, label] of [
  ["drawPile", "draw"],
  ["playDrawnBtn", "play drawn card"],
  ["keepBtn", "keep drawn card"],
  ["onuBtn", "Onu call"],
  ["gotchaBtn", "Gotcha call"],
  ["jumpBtn", "Jump-In"],
]) {
  check(isButton(html, id), `#${id} is a native button for ${label}`);
}
check(hasAccessibleName(html, "drawPile"), "#drawPile has an accessible draw label");

check(
  /createElement\(\s*["']button["']\s*\)[\s\S]{0,500}?className\s*=\s*["'`]card\b/i.test(browserSource)
    || /<button\b[^>]*class=["'][^"']*\bcard\b/i.test(html),
  "playable cards are rendered as native buttons",
);

// Personality tells are persistent disclosures, not hover-only copy.
check(
  /(?:class\s*=\s*["'`][^"'`]*\bpersonalityBtn\b|className\s*=\s*["'`]personalityBtn\b|classList\.add\(\s*["']personalityBtn["'])/i.test(browserSource),
  ".personalityBtn disclosure hook is present",
);
check(/aria-expanded/i.test(browserSource), "personality disclosures expose aria-expanded state");

// Dynamic prompts still need dialog semantics, and turn state must be announced.
check(
  /<dialog\b/i.test(browserSource)
    || /role\s*=\s*["'`]dialog["'`]/i.test(browserSource)
    || /setAttribute\(\s*["']role["']\s*,\s*["']dialog["']\s*\)/i.test(browserSource),
  "required prompts use dialog semantics",
);
check(
  /<dialog\b/i.test(browserSource)
    || /aria-modal\s*=\s*["'`]true["'`]/i.test(browserSource)
    || /setAttribute\(\s*["']aria-modal["']\s*,\s*["']true["']\s*\)/i.test(browserSource),
  "required prompts identify themselves as modal",
);
const status = openingTagWithId(html, "status");
check(Boolean(status), "#status is present");
check(
  attribute(status, "role") === "status" || attribute(status, "aria-live") === "polite",
  "#status is a polite live status region",
);

// Static ids must be unique. Script/style text is removed so generated templates
// do not look like duplicate nodes before they are instantiated.
const markup = html
  .replace(/<!--[\s\S]*?-->/g, "")
  .replace(/<script\b[\s\S]*?<\/script>/gi, "")
  .replace(/<style\b[\s\S]*?<\/style>/gi, "");
const ids = [...markup.matchAll(/\bid\s*=\s*["']([^"']+)["']/gi)].map((match) => match[1]);
const duplicates = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
check(duplicates.length === 0, `static ids are unique${duplicates.length ? `: ${duplicates.join(", ")}` : ""}`);

// Every resource fetched by the shell must be local and present. Ordinary anchor
// navigation (including the almanac home link) is not a runtime dependency.
const runtimeRefs = [];
for (const match of html.matchAll(/<(script|img|audio|video|source|link)\b([^>]*)>/gi)) {
  const tag = match[1].toLowerCase();
  const attrs = match[2];
  const ref = attrs.match(/\b(?:src|href)\s*=\s*["']([^"']+)["']/i)?.[1];
  if (!ref || ref.startsWith("#") || ref.startsWith("data:") || ref.startsWith("blob:")) continue;
  runtimeRefs.push([tag, ref]);
}
for (const [tag, ref] of runtimeRefs) {
  const external = /^(?:https?:)?\/\//i.test(ref);
  check(!external, `${tag} runtime reference is local: ${ref}`);
  if (external) continue;
  const clean = ref.split(/[?#]/, 1)[0];
  const path = clean.startsWith("/") ? resolve(root, `.${clean}`) : resolve(appDir, clean);
  check(existsSync(path), `${tag} runtime asset exists: ${ref}`);
}
check(!/@import\s+(?:url\()?\s*["']?(?:https?:)?\/\//i.test(html), "page CSS has no external import");
check(!/url\(\s*["']?(?:https?:)?\/\//i.test(html), "page CSS has no external URL");
check(!/\b(?:fetch|import)\s*\(\s*["'`](?:https?:)?\/\//i.test(html), "page script has no external runtime import");
const withoutNavigation = html
  .replace(/(<a\b[^>]*\bhref\s*=\s*)["'](?:https?:)?\/\/[^"']*["']/gi, '$1""')
  .replaceAll("http://www.w3.org/2000/svg", "");
check(
  !/https?:\/\//i.test(withoutNavigation) && !/["'`]\s*\/\/[a-z0-9]/i.test(withoutNavigation),
  "page has no external URL outside ordinary navigation links",
);

// The browser drive gets a narrow, explicit observation/control seam.
check(/window\.__onu\s*=/.test(browserSource), "window.__onu browser-test hook is present");

// ALM-BUG-KILN-00030: storage access must be guarded so a blocked-storage context (all
// cookies blocked, sandboxed iframe) doesn't throw at module load and blank the page.
check(!/^\s*let soundOn = localStorage\./m.test(app), "top-level soundOn must not read localStorage unguarded");
const readStoredSrc = app.match(/function readStored\(key\) \{[\s\S]*?\n\}/);
check(Boolean(readStoredSrc), "app.mjs defines a guarded readStored helper");
if (readStoredSrc) {
  const readStored = new Function("localStorage", `${readStoredSrc[0]}; return readStored;`)({
    getItem() { throw new Error("storage blocked"); },
  });
  check(readStored("onu.sound") === null, "readStored returns null (default) when storage access throws, instead of propagating");
}

if (failures.length) {
  console.error(`Onu static validation failed (${failures.length} of ${checks} checks):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log(`Onu static validation passed (${checks} checks)`);
}
