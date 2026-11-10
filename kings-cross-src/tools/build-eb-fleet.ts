// Build the Edinburgh booked-diagram fleet table from ScotRail's published unit diagrams (as text).
//
//   node tools/build-eb-fleet.ts --text <diagrams.txt> [--year 2026] [--out ~/kx-data/areas/EB/fleet.json]
//
// The relay serves the output at GET /fleet?area=EB and the page matches live EB trains against it
// (core/edinburgh-diagrams.ts). The text and the table are private data: --out must be outside any git
// repository, the file is written 0600 and atomically (temp file, then rename), and the run prints counts
// only, never rows. --year is the timetable year the "Operates until 27th September" notes belong to; it
// defaults to the year in the text file's name.
import { chmod, lstat, mkdir, readFile, realpath, rename, rm, stat, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { parseDiagramText, validateFleetTable } from '../core/edinburgh-diagrams.ts';
import type { FleetTable } from '../core/edinburgh-diagrams.ts';

const MAX_TEXT_BYTES = 64 * 1024 * 1024;

const usage = (): string => 'usage: node tools/build-eb-fleet.ts --text <diagrams.txt> [--year 2026] [--out <fleet.json>]  (default --out: $KX_DATA_DIR or ~/kx-data, then areas/EB/fleet.json)';

function parseArgs(argv: string[]): { text: string; year: number | undefined; out: string | undefined } {
  const values = new Map<string, string>();
  for (let i = 0; i < argv.length; i += 2) {
    const name = argv[i]!, value = argv[i + 1];
    if (!['--text', '--year', '--out'].includes(name)) throw new Error(`Unknown option ${name}\n${usage()}`);
    if (value === undefined || value.startsWith('--')) throw new Error(`Missing value for ${name}\n${usage()}`);
    if (values.has(name)) throw new Error(`${name} given twice`);
    values.set(name, value);
  }
  const text = values.get('--text');
  if (!text) throw new Error(usage());
  const yearText = values.get('--year');
  if (yearText !== undefined && !/^20\d\d$/.test(yearText)) throw new Error('--year must be a four-digit year');
  return { text, year: yearText === undefined ? undefined : Number(yearText), out: values.get('--out') };
}

const expandHome = (p: string): string => p === '~' ? homedir() : p.startsWith('~/') ? path.join(homedir(), p.slice(2)) : p;

function defaultOut(): string {
  const configured = process.env.KX_DATA_DIR;
  if (configured !== undefined && configured.trim() === '') throw new Error('KX_DATA_DIR must name a directory');
  return path.join(configured === undefined ? path.join(homedir(), 'kx-data') : expandHome(configured), 'areas', 'EB', 'fleet.json');
}

const exists = (p: string): Promise<boolean> => lstat(p).then(() => true, (error: NodeJS.ErrnoException) => {
  if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return false;
  throw error;
});

/** The path with its nearest existing ancestor resolved through symlinks, so a link into a repository cannot hide it. */
async function physicalPath(p: string): Promise<string> {
  const tail: string[] = [];
  let head = p;
  while (!(await exists(head))) {
    const parent = path.dirname(head);
    if (parent === head) break;
    tail.unshift(path.basename(head));
    head = parent;
  }
  return path.join(await realpath(head), ...tail);
}

/** Refuse an output path inside a git repository (a `.git` directory or file in it or any parent): the table is private. */
async function refuseInsideGit(out: string): Promise<void> {
  for (let dir = path.dirname(out); ; dir = path.dirname(dir)) {
    if (await exists(path.join(dir, '.git'))) throw new Error(`refusing to write the private fleet table inside a git repository (${dir}); use a path outside it, e.g. ~/kx-data/areas/EB/fleet.json`);
    if (path.dirname(dir) === dir) return;
  }
}

/** Formation label for the counts, order-free: "385x3+385x4" ("?" for a unit of no known class). */
const formationLabel = (w: FleetTable['workings'][number]): string => w.units.map(u => u.class === null ? '?' : `${u.class}x${u.cars}`).sort().join('+');

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const textPath = path.resolve(args.text);
  const nameYear = /(20\d\d)/.exec(path.basename(textPath))?.[1];
  const year = args.year ?? (nameYear === undefined ? undefined : Number(nameYear));
  if (year === undefined) throw new Error('pass --year: the text file name does not contain one');
  // The directory is resolved through symlinks (so a link into a repository cannot hide it); the file name is kept
  // as given, so an output that is itself a symlink is seen and refused below.
  const wanted = path.resolve(expandHome(args.out ?? defaultOut()));
  const out = path.join(await physicalPath(path.dirname(wanted)), path.basename(wanted));
  await refuseInsideGit(out);

  const size = (await stat(textPath)).size;
  if (size > MAX_TEXT_BYTES) throw new Error('diagram text is too large');
  const { workings, stats } = parseDiagramText(await readFile(textPath, 'utf8'), { year });
  if (!workings.length) throw new Error('no workings call at Edinburgh in that text; is it the unit diagram report?');
  const table: FleetTable = { source: path.basename(textPath), builtAt: new Date().toISOString(), workings };
  const body = `${JSON.stringify(table)}\n`;
  validateFleetTable(JSON.parse(body));

  await mkdir(path.dirname(out), { recursive: true, mode: 0o700 });
  if (await exists(out)) {
    const entry = await lstat(out);
    if (entry.isSymbolicLink() || !entry.isFile()) throw new Error('refusing to replace an output that is not a regular file');
  }
  const temp = `${out}.${process.pid}.tmp`;
  try {
    await writeFile(temp, body, { flag: 'wx', mode: 0o600 });
    await chmod(temp, 0o600);
    await rename(temp, out);
  } catch (error) {
    await rm(temp, { force: true });
    throw error;
  }

  const counts = new Map<string, number>();
  for (const w of workings) counts.set(formationLabel(w), (counts.get(formationLabel(w)) ?? 0) + 1);
  console.log(`fleet: ${workings.length} workings call at Edinburgh, from ${stats.blocks} diagram blocks (skipped ${stats.skippedDays} for days, ${stats.skippedDateNote} for date note; ${stats.unclassifiedBlocks} blocks with no class)`);
  console.log(`by formation: ${[...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([label, n]) => `${label} ${n}`).join(', ')}`);
  console.log(`wrote ${out} (${body.length} bytes, mode 0600)`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
