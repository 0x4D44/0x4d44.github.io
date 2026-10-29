// Payload budget check (CONTRACT 8 / RUBRIC M10). Plain Node, no dependencies.
//   node la-ladera/tests/payload.mjs [--json]      exit 1 when a budget is broken
//
// Budgets: textures <= 24 MB, models <= 32 MB (people <= 14, furniture <= 10, world <= 6, arch <= 2), no file > 8 MB,
// shipped total (everything except vendor/, dev/, labs/, tests/, tools/) <= 60 MB, estimated GPU texture memory <= 220 MB.
import './nice.mjs';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { resolve, dirname, relative, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MB = 1048576;
const SKIP_TOTAL = new Set(['vendor', 'dev', 'labs', 'tests', 'tools']);

function walk(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = resolve(dir, e.name);
    if (e.isDirectory()) walk(p, out); else out.push({ rel: relative(ROOT, p).split(sep).join('/'), size: statSync(p).size, path: p });
  }
  return out;
}

/** Pixel size of a PNG / JPEG / WebP from its header (no decoding). */
function dims(path) {
  const b = readFileSync(path), ext = extname(path).toLowerCase();
  try {
    if (ext === '.png') return [b.readUInt32BE(16), b.readUInt32BE(20)];
    if (ext === '.jpg' || ext === '.jpeg') {
      let i = 2;
      while (i < b.length) {
        if (b[i] !== 0xff) { i++; continue; }
        const m = b[i + 1];
        if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return [b.readUInt16BE(i + 7), b.readUInt16BE(i + 5)];
        i += 2 + b.readUInt16BE(i + 2);
      }
    }
    if (ext === '.webp' && b.toString('ascii', 8, 12) === 'WEBP') {
      const k = b.toString('ascii', 12, 16);
      if (k === 'VP8X') return [1 + b.readUIntLE(24, 3), 1 + b.readUIntLE(27, 3)];
      if (k === 'VP8 ') return [b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff];
    }
  } catch { /* fall through */ }
  return null;
}

const files = walk(ROOT);
const top = (f) => f.rel.split('/')[0];
const sum = (list) => list.reduce((s, f) => s + f.size, 0);
const shipped = files.filter((f) => !SKIP_TOTAL.has(top(f)));
const tex = files.filter((f) => f.rel.startsWith('assets/textures/'));
const models = files.filter((f) => f.rel.startsWith('assets/models/'));
const sub = (name) => models.filter((f) => f.rel.startsWith(`assets/models/${name}/`));
const imgs = files.filter((f) => /\.(png|jpe?g|webp)$/i.test(f.rel) && (f.rel.startsWith('assets/')));
let gpu = 0; const unknown = [];
for (const f of imgs) { const d = dims(f.path); if (d) gpu += d[0] * d[1] * 4 * (4 / 3); else unknown.push(f.rel); }

const rows = [
  ['textures', sum(tex) / MB, 24], ['models', sum(models) / MB, 32], ['models/people', sum(sub('people')) / MB, 14],
  ['models/furniture', sum(sub('furniture')) / MB, 10], ['models/world', sum(sub('world')) / MB, 6], ['models/arch', sum(sub('arch')) / MB, 2],
  ['shipped total (excl. vendor,dev,labs,tests,tools)', sum(shipped) / MB, 60], ['estimated GPU texture memory', gpu / MB, 220],
];
const biggest = files.filter((f) => !f.rel.startsWith('vendor/')).sort((a, b) => b.size - a.size).slice(0, 8).map((f) => `${(f.size / MB).toFixed(2)} MB  ${f.rel}`);
const over = files.filter((f) => f.size > 8 * MB && !f.rel.startsWith('vendor/')).map((f) => f.rel);
const failures = [...rows.filter((r) => r[1] > r[2]).map((r) => `${r[0]}: ${r[1].toFixed(1)} MB > ${r[2]} MB`), ...over.map((r) => `file over 8 MB: ${r}`)];

const report = { ok: failures.length === 0, failures, budgets: rows.map(([name, mb, max]) => ({ name, mb: +mb.toFixed(2), max })), largest: biggest, textureFiles: tex.length, modelFiles: models.length, unreadableImageSizes: unknown };
if (process.argv.includes('--json')) console.log(JSON.stringify(report, null, 2));
else {
  for (const r of rows) console.log(`${r[1] > r[2] ? 'FAIL' : 'ok  '} ${r[0].padEnd(52)} ${r[1].toFixed(1).padStart(7)} / ${r[2]} MB`);
  console.log('largest files:\n  ' + biggest.join('\n  '));
  if (unknown.length) console.log('image sizes not readable:', unknown.join(', '));
  console.log(report.ok ? 'PAYLOAD OK' : 'PAYLOAD OVER BUDGET:\n  ' + failures.join('\n  '));
}
process.exit(report.ok ? 0 : 1);
