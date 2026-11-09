// Offline private derivation. Outputs are deliberately restricted to the worktree .scratch.
import { readFile, writeFile, mkdir, stat, readdir, realpath } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import path from 'node:path';
import { homedir } from 'node:os';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { buildStPancrasAnchors, stPancrasMmlPlatformGeometry } from '../core/stpancras.ts';
import type { KxData } from '../core/osm.ts';
import type { RecordingEvent, SmartRow } from '../core/berths.ts';

const root = fileURLToPath(new URL('../../', import.meta.url));
const args = process.argv.slice(2);
const options = new Map<string, string>();
for (let i = 0; i < args.length; i += 2) {
  const key = args[i]!, value = args[i + 1];
  if (!['--osm', '--smart', '--data-dir', '--out'].includes(key) || !value || value.startsWith('--')) throw new Error('Usage: stpancras-anchors.ts [--osm compact.json] [--smart smart.json.gz] [--data-dir recordings] [--out .scratch/output]');
  options.set(key, value);
}
const out = path.resolve(root, options.get('--out') ?? '.scratch/a42/wh');
const scratch = path.join(root, '.scratch');
if (!out.startsWith(scratch + path.sep)) throw new Error('Output must be inside the worktree .scratch');
// Resolve the nearest existing ancestor before mkdir so a symlink cannot redirect writes.
await mkdir(scratch, { recursive: true });
const scratchReal = await realpath(scratch);
if (scratchReal !== scratch) throw new Error('Worktree .scratch must not be a symlink');
let ancestor = out;
while (true) {
  try {
    const actual = await realpath(ancestor);
    if (actual !== scratchReal && !actual.startsWith(scratchReal + path.sep)) throw new Error('Output resolves outside .scratch');
    break;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    ancestor = path.dirname(ancestor);
  }
}
await mkdir(out, { recursive: true });
const osmPath = path.resolve(options.get('--osm') ?? path.join(root, 'kings-cross-src/web/src/data/kx-track.json'));
const smartPath = path.resolve(options.get('--smart') ?? path.join(homedir(), 'kx-data/smart.json.gz'));
const sha256 = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex');
const osmBytes = await readFile(osmPath), smartBytes = await readFile(smartPath);
const data = JSON.parse(osmBytes.toString('utf8')) as KxData;
const parsed: unknown = JSON.parse(gunzipSync(smartBytes).toString('utf8'));
const rows = (parsed as { BERTHDATA?: unknown })?.BERTHDATA;
if (!Array.isArray(rows) || rows.some(row => !row || typeof row !== 'object' || Array.isArray(row))) throw new Error('SMART requires a BERTHDATA array of objects');
const recordings: RecordingEvent[][] = [], sources: string[] = [];
if (options.has('--data-dir')) {
  const selected = path.resolve(options.get('--data-dir')!);
  const nested = path.join(selected, 'recordings');
  let dir = selected;
  try { if ((await stat(nested)).isDirectory()) dir = nested; }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  for (const name of (await readdir(dir)).filter(n => /^td-WH-[A-Za-z0-9_-]+\.(?:ndjson|jsonl)(?:\.gz)?$/.test(n)).sort()) {
    const bytes = await readFile(path.join(dir, name));
    // A single read freezes this snapshot. Only newline-terminated records are committed
    // by the recorder; retain tail provenance without accepting malformed full lines.
    const decoded = name.endsWith('.gz') ? gunzipSync(bytes) : bytes;
    const completeEnd = decoded.lastIndexOf(10) + 1;
    const tail = decoded.subarray(completeEnd);
    const content = decoded.subarray(0, completeEnd).toString('utf8');
    const records = content.split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line) as RecordingEvent);
    sources.push(`Recording snapshot ${name}: ${decoded.length} decoded bytes, sha256 ${sha256(decoded)}; complete newline bytes ${completeEnd}; ignored incomplete tail: ${tail.length} bytes, sha256 ${sha256(tail)}`);
    if (records.some(record => !record.e || record.e.area !== 'WH')) throw new Error(`Invalid normalized recording: ${name}`);
    recordings.push(records); sources.push(`Recording: ${name}`);
  }
}
const map = buildStPancrasAnchors(data, rows as SmartRow[], recordings);
map.sources.push(`OSM input sha256 ${sha256(osmBytes)}`, `SMART compressed input sha256 ${sha256(smartBytes)}`, `SMART file modified ${(await stat(smartPath)).mtime.toISOString()} (not an authoritative issue date)`, ...sources);
await writeFile(path.join(out, 'anchors.json'), JSON.stringify(map, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
await writeFile(path.join(out, 'geometry.json'), JSON.stringify(stPancrasMmlPlatformGeometry(data), null, 2) + '\n', { flag: 'wx', mode: 0o600 });
console.log(`WH: ${map.anchors.length} provisional platform anchors; ${map.unmapped.length} explicitly unmapped. Private output: ${out}`);
