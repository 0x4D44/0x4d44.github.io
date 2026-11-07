// Fetches the King's Cross OSM extract (Overpass) and writes the compact model the page loads.
//
//   node tools/build-data.ts --raw ../.scratch/kx-osm.json [--out web/src/data/kx-track.json]
//
// If the --raw file exists it is reused (no network); otherwise it is fetched and saved there.
// The raw extract is not committed; only the compact output is.
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { compactOsm } from '../core/osm.ts';
import type { RawElement } from '../core/osm.ts';

const args = process.argv.slice(2);
const flag = (name: string): string | undefined => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const rawPath = flag('--raw');
const outPath = flag('--out') ?? 'web/src/data/kx-track.json';
if (!rawPath) {
  console.error('usage: node tools/build-data.ts --raw <raw.json> [--out <compact.json>]');
  process.exit(2);
}

const QUERY = `[out:json][timeout:80];(
  way["railway"~"^(rail|platform)$"](51.527,-0.132,51.546,-0.113);
  node["railway"~"^(signal|switch|buffer_stop)$"](51.527,-0.132,51.546,-0.113);
  way["building"](51.5285,-0.1285,51.5395,-0.1155);
);out body geom;`;

const ENDPOINTS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];

async function loadRaw(): Promise<RawElement[]> {
  if (existsSync(rawPath as string)) {
    console.error(`using saved extract ${rawPath}`);
    return JSON.parse(await readFile(rawPath as string, 'utf8')).elements;
  }
  let text = '';
  const failures: string[] = [];
  for (const endpoint of ENDPOINTS) {
    console.error(`fetching from ${endpoint}…`);
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded', 'user-agent': 'almanac-kings-cross-build/0.1' },
        body: `data=${encodeURIComponent(QUERY)}`,
      });
      if (res.ok) {
        text = await res.text();
        break;
      }
      failures.push(`${endpoint}: HTTP ${res.status}`);
    } catch (err) {
      failures.push(`${endpoint}: ${(err as Error).message}`);
    }
  }
  if (!text) throw new Error(`Overpass fetch failed (${failures.join('; ')}). Retry later or pass a saved extract.`);
  await mkdir(path.dirname(rawPath as string), { recursive: true });
  await writeFile(rawPath as string, text);
  return JSON.parse(text).elements;
}

const data = compactOsm(await loadRaw());
await mkdir(path.dirname(outPath), { recursive: true });
await writeFile(outPath, `${JSON.stringify(data)}\n`);
console.error(
  `wrote ${outPath}: ${data.rails.length} rails, ${data.nodes.length} nodes, ${data.switches.length} switches, ` +
    `${data.buffers.length} buffers, ${data.signals.length} signals, ${data.platforms.length} platforms, ${data.buildings.length} buildings`,
);
