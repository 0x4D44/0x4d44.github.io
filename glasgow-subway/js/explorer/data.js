// Data loading with graceful fallbacks (A1 subway.json, A2 terrain + city manifest).
import { makePlaceholderSubway, fakeTerrainModule, fakeGround } from './placeholder.js';

async function getJSON(url) {
  const r = await fetch(url, { cache: 'no-cache' });
  if (!r.ok) throw new Error(url + ' ' + r.status);
  return r.json();
}
export async function loadAll(base, progress = () => {}) {
  const out = { subway: null, terrain: null, manifest: null, facts: null, notes: [] };
  // Terrain first (stations need ground for the placeholder, long-section needs it).
  progress(0.04, 'Reading the terrain');
  try {
    const mod = await import(new URL('js/shared/terrain.js', base).href);
    await mod.loadTerrain(new URL('data/terrain.json', base).href);
    if (typeof mod.groundHeight !== 'function' || !Number.isFinite(mod.groundHeight(0, 0))) throw new Error('bad terrain');
    out.terrain = mod;
  } catch (e) { out.terrain = fakeTerrainModule(); out.notes.push('terrain placeholder: ' + e.message); }
  progress(0.12, 'Surveying the tunnels');
  try {
    const s = await getJSON(new URL('data/subway.json', base));
    if (!s.stations?.length || !s.tracks?.outer?.points?.length) throw new Error('subway.json incomplete');
    out.subway = s;
  } catch (e) { out.subway = makePlaceholderSubway(out.terrain.groundHeight || fakeGround); out.notes.push('subway placeholder: ' + e.message); }
  progress(0.2, 'Fetching the city plan');
  try { out.manifest = await getJSON(new URL('data/city/manifest.json', base)); if (!out.manifest.chunks?.length) throw new Error('empty manifest'); }
  catch (e) { out.manifest = null; out.notes.push('city placeholder: ' + e.message); }
  try { out.facts = await getJSON(new URL('data/facts.json', base)); } catch { out.facts = null; }
  out.subway.stations.sort((a, b) => a.order - b.order);
  return out;
}
