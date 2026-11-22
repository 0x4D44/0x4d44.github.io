// Build Perth's private anchors from reviewed or explicitly provisional placements.
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { STATIONS } from '../core/station-config.ts';
import { DEFAULT_AREA_ASSETS } from '../relay/sclass-areas.mjs';
import { buildGraph } from '../core/graph.ts';
import { decodeWaverleyAnchorScene, waverleyPlatformGeometry, waverleyTrackData } from '../core/waverley-anchors.ts';
import { privatePerthDirectory, readPrivatePerthJson, writePrivatePerthJson } from './perth-discovery.mjs';

export function buildPerthAnchors(geometry, area, berths, { provisionalHeading = false, placements = [] } = {}) {
  if (!/^[A-Z0-9]{2}$/.test(area) || !Array.isArray(berths) || !Array.isArray(placements)) throw new Error('Invalid Perth anchor inputs');
  const scene = decodeWaverleyAnchorScene(geometry), data = waverleyTrackData(scene), graph = buildGraph(data);
  const platformGeometry = waverleyPlatformGeometry(scene), reviewed = new Map(), inventory = new Map();
  for (const row of berths) {
    if (!row || !/^[A-Z0-9]{4}$/.test(row.berth ?? '') || !['station', 'approach'].includes(row.role) ||
        !Number.isSafeInteger(row.support) || row.support < 1) throw new Error('Invalid Perth discovery berth');
    const rows = inventory.get(row.berth) ?? [];
    rows.push(row);
    inventory.set(row.berth, rows);
  }
  for (const p of placements) {
    const from = graph.pos.get(p?.from), to = graph.pos.get(p?.to);
    if (!p || !inventory.has(p.berth) || reviewed.has(p.berth) || !from || !to ||
        !graph.adj.get(p.from)?.some(e => e.a === p.to || e.b === p.to) ||
        !Number.isFinite(p.t) || p.t < 0 || p.t > 1 || !Number.isFinite(p.errorM) || p.errorM < 0 ||
        typeof p.evidence !== 'string' || !p.evidence.trim()) throw new Error('invalid reviewed placement');
    const point = from.map((v, i) => v + (to[i] - v) * p.t);
    reviewed.set(p.berth, { berth: p.berth, kind: 'inferred', from: p.from, to: p.to, t: p.t, point, errorM: p.errorM, evidence: p.evidence });
  }
  const map = { area, sources: [scene.attribution, 'Private Perth discovery: TD steps paired with TRUST actuals',
    'Local coordinate and layer identities from Perth public rail chords'], anchors: [], unmapped: [] };
  for (const [berth, rows] of [...inventory].sort(([a], [b]) => a.localeCompare(b))) {
    const reviewedAnchor = reviewed.get(berth);
    if (reviewedAnchor) { map.anchors.push(reviewedAnchor); continue; }
    const row = rows.find(r => r.role === 'station');
    const platform = row?.platform && platformGeometry.find(p => p.ref === row.platform);
    const candidate = platform?.platformIds.length === 1 && platform.candidates.length === 1 ? platform.candidates[0] : undefined;
    if (provisionalHeading && row?.confidence === 'high' && row.platform && row.platformSupport?.[row.platform] >= 3 && candidate) {
      map.anchors.push({ berth, kind: 'inferred', from: candidate.from, to: candidate.to, t: candidate.t, point: candidate.point,
        errorM: Math.max(50, platform.lengthM), evidence: `Repeated Perth TRUST/TD correlation, platform ${row.platform}; ASSUMED representative point with full-platform uncertainty and heading toward increasing node identity` });
    } else {
      map.unmapped.push({ berth, seen: Math.max(...rows.map(r => r.support)), reason: 'no-evidence',
        detail: row ? 'Requires reviewed track and heading, or repeated platform evidence and a unique public track for provisional placement'
          : 'Approach correlation requires independent evidence for its track position and heading' });
    }
  }
  const review = { area, platformGeometry, nodes: data.nodes, rails: data.rails, unmapped: map.unmapped };
  return { map, review };
}

async function main() {
  const { values } = parseArgs({ options: { area: { type: 'string' }, 'provisional-heading': { type: 'boolean' }, replace: { type: 'boolean' } } });
  const area = values.area;
  if (!STATIONS.perth.tdAreas.includes(area)) throw new Error('Set the confirmed Perth area in core/station-config.ts, then pass it with --area');
  const dir = await privatePerthDirectory('areas', area);
  const discovery = await readPrivatePerthJson(dir, 'perth-discovery.json');
  if (discovery?.area !== area) throw new Error('Discovery report is for another area');
  const placements = await readPrivatePerthJson(dir, 'perth-placements.json', true);
  const geometry = JSON.parse(await readFile(DEFAULT_AREA_ASSETS[area].trackPath, 'utf8'));
  const { map, review } = buildPerthAnchors(geometry, area, discovery.berths, { provisionalHeading: values['provisional-heading'], placements });
  await writePrivatePerthJson(dir, 'perth-anchor-review.json', review);
  if (!map.anchors.length) throw new Error('No placed Perth anchors; use the private review to resolve track and heading');
  try { await writePrivatePerthJson(dir, 'anchors.json', map, Boolean(values.replace)); }
  catch (error) {
    if (error.code === 'EEXIST') throw new Error('Private anchors.json already exists; pass --replace to replace it');
    throw error;
  }
  console.log(`Wrote ${map.anchors.length} Perth anchors; ${map.unmapped.length} unresolved. Outputs remain under KX_DATA_DIR.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
