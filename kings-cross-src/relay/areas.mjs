import path from 'node:path';

const AREA_ID = /^[A-Z0-9]{2}$/;

function areaList(value) {
  const entries = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(',')
      : null;
  if (!entries || entries.length === 0) throw new Error('areas: expected a non-empty comma-separated list or array');

  const result = [];
  const seen = new Set();
  for (const entry of entries) {
    if (typeof entry !== 'string') throw new Error('areas: each area must be a two-character string');
    const area = entry.trim();
    if (!AREA_ID.test(area)) throw new Error(`areas: invalid area ${JSON.stringify(entry)}`);
    if (!seen.has(area)) {
      seen.add(area);
      result.push(area);
    }
  }
  if (result.length === 0) throw new Error('areas: at least one area is required');
  return result;
}

// Accept a TD area allowlist as a comma-separated value (for KX_AREAS) or an
// array (for callers and tests). Keep first occurrence order when deduplicating.
export function configuredAreas(value, fallback = 'Y9') {
  return areaList(value === undefined ? fallback : value);
}

// Return the selected query area or throw so HTTP callers can refuse the request.
// Only the `area` selector is interpreted; paths and all other query keys are ignored.
export function requestArea(url, areas, defaultArea = 'Y9') {
  const allowed = new Set(areaList(areas));
  const fallbacks = areaList(defaultArea);
  if (fallbacks.length !== 1) throw new Error('areas: default area must be a single area');
  const [fallback] = fallbacks;

  let parsed;
  try {
    parsed = url instanceof URL ? url : new URL(String(url), 'http://localhost');
  } catch {
    throw new Error('areas: invalid request URL');
  }
  const selectors = parsed.searchParams.getAll('area');
  if (selectors.length > 1) throw new Error('areas: area selector must appear only once');

  const selected = selectors.length === 0 ? fallback : selectors[0];
  if (typeof selected !== 'string' || !AREA_ID.test(selected)) {
    throw new Error('areas: area selector must be two uppercase alphanumeric characters');
  }
  if (!allowed.has(selected)) throw new Error(`areas: unknown area ${JSON.stringify(selected)}`);
  return selected;
}

// Keep the existing Y9 data layout intact while isolating every additional area.
export function areaDataDir(dataDir, area) {
  if (typeof area !== 'string' || !AREA_ID.test(area)) {
    throw new Error(`areas: invalid area ${JSON.stringify(area)}`);
  }
  return area === 'Y9' ? dataDir : path.join(dataDir, 'areas', area);
}
