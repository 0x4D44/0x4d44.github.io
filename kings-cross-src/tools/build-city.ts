// Builds web/src/data/kx-city.json: the streets, canal, squares, parks and trees around King's Cross.
//
//   node tools/build-city.ts [--raw ~/kx-data/osm/kx-city-osm.json] [--out web/src/data/kx-city.json]
//
// If the --raw file exists it is reused (no network); otherwise the query below is run against the
// Overpass API and the answer saved there. The raw extract is not committed; only the compact output is.
//
// Data: © OpenStreetMap contributors, ODbL (https://www.openstreetmap.org/copyright). The page credits it.
// Recorded fetch: 2026-11-08, overpass-api.de, extract timestamp 2026-11-08T18:09:47Z (osm3s.timestamp_osm_base),
// 3671 elements, 2.0 MB. The bounding box covers the buildings of kx-track.json (51.5280..51.5399 N,
// -0.1306..-0.1148 E) plus a margin: 51.5275, -0.1315, 51.5405, -0.1140 (south, west, north, east).
// The cached railway/building extract (kx-osm.json) holds no highways, waterways or land use, which is why
// this second query exists. A generic User-Agent is sent; no credentials, no email address.
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { compactCity } from '../core/city.ts';
import type { RawCityElement } from '../core/city.ts';

const args = process.argv.slice(2);
const flag = (name: string): string | undefined => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const rawPath = flag('--raw') ?? path.join(os.homedir(), 'kx-data', 'osm', 'kx-city-osm.json');
const outPath = flag('--out') ?? 'web/src/data/kx-city.json';

const BOX = '(51.5275,-0.1315,51.5405,-0.1140)';
export const QUERY = `[out:json][timeout:180];
(
  way["highway"]["highway"!~"^(proposed|construction|corridor|elevator|platform|bus_stop|services|rest_area|raceway|emergency_bay|via_ferrata)$"]["footway"!~"^(sidewalk|crossing)$"]${BOX};
  way["waterway"]${BOX};
  way["natural"~"^(water|wood|scrub|grassland|heath|tree_row)$"]${BOX};
  relation["natural"~"^(water|wood)$"]${BOX};
  way["landuse"~"^(grass|recreation_ground|village_green|forest|meadow|allotments|cemetery|flowerbed)$"]${BOX};
  relation["landuse"~"^(grass|recreation_ground|village_green|forest|meadow|allotments|cemetery)$"]${BOX};
  way["leisure"~"^(park|garden|pitch|playground|common|nature_reserve|track|swimming_pool)$"]${BOX};
  relation["leisure"~"^(park|garden|common|nature_reserve)$"]${BOX};
  way["place"="square"]${BOX};
  way["area:highway"]${BOX};
  node["natural"="tree"]${BOX};
);
out body geom;
`;

const ENDPOINTS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];

async function loadRaw(): Promise<{ elements: RawCityElement[]; extract: string }> {
  if (existsSync(rawPath)) {
    console.error(`using saved extract ${rawPath}`);
    const j = JSON.parse(await readFile(rawPath, 'utf8'));
    return { elements: j.elements, extract: j.osm3s?.timestamp_osm_base ?? '' };
  }
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
        const text = await res.text();
        await mkdir(path.dirname(rawPath), { recursive: true });
        await writeFile(rawPath, text);
        const j = JSON.parse(text);
        return { elements: j.elements, extract: j.osm3s?.timestamp_osm_base ?? '' };
      }
      failures.push(`${endpoint}: HTTP ${res.status}`);
    } catch (err) {
      failures.push(`${endpoint}: ${(err as Error).message}`);
    }
  }
  throw new Error(`Overpass fetch failed (${failures.join('; ')}). Retry later or pass a saved extract.`);
}

if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) {
  const raw = await loadRaw();
  const city = compactCity(raw.elements, undefined, raw.extract);
  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, `${JSON.stringify(city)}\n`);
  const byClass: Record<string, number> = {};
  for (const r of city.roads) byClass[r.cls] = (byClass[r.cls] ?? 0) + 1;
  console.error(
    `wrote ${outPath}: ${city.roads.length} roads (${Object.entries(byClass).map(([k, v]) => `${k} ${v}`).join(', ')}), ` +
      `${city.canals.length} canal lines, ${city.areas.length} areas, ${city.trees.length} trees`,
  );
}
