// Adult wearable catalogue -> plain runtime data and the measured asset manifest.
//   node la-ladera/tools/people_wear_data.mjs --write-data
//   node la-ladera/tools/people_wear_data.mjs --write       (after people_wear_build.py)
// With no flags, prints wear_data.js for the exact generated-data drift guard.
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, resolve, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => JSON.parse(readFileSync(p, 'utf8'));
const sha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');
const own = (o, k) => Object.hasOwn(o, k);

// These are the current body inputs, including both rendered LODs, every PBR
// page, all six replaced recipes, and the two manifests this optional set must
// leave alone. Text provenance is canonical LF; binary provenance is exact.
export const PEOPLE_WEAR_SOURCE_PATHS = Object.freeze([
  'assets/models/people/people.glb', 'assets/models/people/people_lod.glb',
  'assets/models/people/people_meta.json', 'assets/models/people/people_albedo.jpg',
  'assets/models/people/people_normal.jpg', 'assets/models/people/people_orm.jpg',
  'tools/blender/people_body.py', 'tools/blender/people_body_limbs.py',
  'tools/blender/people_tex.py', 'tools/blender/people_head.py',
  'tools/blender/people_build.py', 'tools/blender/people_cast.py',
  'assets/models/manifest.people.json', 'assets/models/manifest.json',
].sort());

export function peopleWearSourceInputs(root = ROOT) {
  return PEOPLE_WEAR_SOURCE_PATHS.map(path => {
    const raw = readFileSync(join(root, path)), text = /\.(?:py|json)$/.test(path);
    const bytes = text ? Buffer.from(raw.toString('utf8').replace(/\r\n/g, '\n')) : raw;
    return { path, form: text ? 'LF' : 'bytes', bytes: bytes.length,
      sha256: createHash('sha256').update(bytes).digest('hex') };
  });
}

export function checkPeopleWearSourceInputs(actual, root = ROOT) {
  const expected = peopleWearSourceInputs(root);
  if (!Array.isArray(actual) || JSON.stringify(actual) !== JSON.stringify(expected))
    throw new Error('wear current-body source fingerprints changed or are incomplete; regenerate from all current inputs');
  return expected;
}

const compactAuthoring = (value, key = '') => Array.isArray(value)
  ? (['passes', 'history', 'iterations'].includes(key) ? value.length : value.map(v => compactAuthoring(v)))
  : value && typeof value === 'object'
    ? Object.fromEntries(Object.entries(value).map(([k, v]) => [k, compactAuthoring(v, k)])) : value;
const ordered = value => Array.isArray(value) ? value.map(ordered) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, ordered(value[key])])) : value;

/** Full authoring proof stays outside shipped model metadata, but remains an
 * exact certificate input. The small runtime inventory summary must still
 * describe that same proof; moving it to dev does not remove a fingerprint. */
export function checkWearAuthoringReports(fit, id, root = ROOT) {
  const pins = [];
  for (const [field, phase] of [['restFit', 'rest'], ['faceFit', 'faces'], ['poseFit', 'seated']]) {
    if (!fit[field]) continue; // Raw, pre-authoring diagnostics have no claim.
    const { report: proof, ...actual } = fit[field];
    if (proof?.path !== `dev/wear/authoring/${id}/${phase}.json` || proof.form !== 'LF')
      throw new Error(`${id}: missing ${phase} authoring report pin`);
    const bytes = Buffer.from(readFileSync(join(root, proof.path), 'utf8').replace(/\r\n/g, '\n'));
    if (bytes.length !== proof.bytes || createHash('sha256').update(bytes).digest('hex') !== proof.sha256)
      throw new Error(`${id}: ${phase} authoring report bytes changed`);
    const authored = JSON.parse(bytes);
    if (authored.id !== id || authored.authoringOnly !== true || authored.converged !== true)
      throw new Error(`${id}: ${phase} authoring report is incomplete or belongs to another fit`);
    let expected;
    if (phase === 'rest') {
      if (!Array.isArray(authored.passes)) throw new Error(`${id}: malformed rest authoring proof`);
      expected = { samples: 1, passes: authored.passes.length, movedVertices: authored.movedVertices,
        maxDisplacementM: authored.maxDisplacement, boundedSearches: authored.boundedSearches, unresolved: 0 };
    } else if (phase === 'faces') {
      if (!Array.isArray(authored.pools)) throw new Error(`${id}: malformed faces authoring proof`);
      const { pools, ...summary } = compactAuthoring(authored);
      expected = { ...summary, poolCount: pools.length };
    } else {
      if (!Array.isArray(authored.staticRows) || !Array.isArray(authored.targets)) throw new Error(`${id}: malformed seated authoring proof`);
      const { staticRows, targets, ...summary } = compactAuthoring(authored);
      expected = { ...summary, staticRowCount: staticRows.length, targetCount: targets.length };
      // The emitted-byte pose-target checks independently validate this packing
      // descriptor, which is created after the numerical authoring report.
      delete actual.encoding;
    }
    if (JSON.stringify(ordered(actual)) !== JSON.stringify(ordered(expected)))
      throw new Error(`${id}: ${phase} authoring summary differs from its full proof`);
    pins.push({ path: proof.path, form: 'LF', bytes: bytes.length, sha256: proof.sha256 });
  }
  return pins;
}

export function wearSources(root = ROOT) {
  const catalogue = read(join(root, 'tools/blender/people_wear.catalog.json'));
  const palette = read(join(root, 'assets/models', catalogue.palette));
  const partA = read(join(root, 'assets/models/manifest.garments.json'));
  const contract = read(join(root, 'tools/blender/people_contract.json'));
  const meta = read(join(root, 'assets/models/people/people_meta.json'));
  if (catalogue.schemaVersion !== 1 || catalogue.adultOnly !== true || catalogue.defaultEnabled !== false) throw new Error('wear catalogue must be adult-only and disabled by default');
  const adults = new Set(meta.people.filter((p) => !(p.tags ?? []).some((t) => ['kid', 'teen', 'boy', 'girl'].includes(t)) && (p.tags ?? []).some((t) => ['adult', 'elder'].includes(t))).map((p) => p.id));
  if (JSON.stringify([...adults].sort()) !== JSON.stringify(Object.keys(catalogue.fits).sort())) throw new Error('wear fits must exactly match the existing adult/elder residents');
  const ids = new Set();
  const designs = new Map();
  for (const file of partA.files ?? []) for (const asset of Object.values(file.assets ?? {})) {
    if (!asset.garment) continue;
    const variants = designs.get(asset.garment) ?? new Set();
    for (const variant of asset.variants ?? []) variants.add(variant);
    designs.set(asset.garment, variants);
  }
  for (const g of catalogue.garments) {
    if (!g.id || ids.has(g.id)) throw new Error('duplicate or missing wear garment id');
    ids.add(g.id);
    if (!g.variants?.length || g.variants.some((v) => !own(palette.variants, v))) throw new Error(`${g.id}: unknown or missing colour variants`);
    if (g.sourceDesign != null) {
      const variants = designs.get(g.sourceDesign);
      if (!variants) throw new Error(`${g.id}: source design ${g.sourceDesign} is absent from the Part A garment manifest`);
      if (g.variants.some((v) => !variants.has(v))) throw new Error(`${g.id}: colour set is not part of its reused Part A source design`);
    }
    if (!g.archetypes?.length || g.archetypes.some((a) => !own(catalogue.archetypes, a))) throw new Error(`${g.id}: unknown or missing archetypes`);
    if (!g.occupies?.length || !g.contexts?.length) throw new Error(`${g.id}: missing slot/context contract`);
  }
  for (const [id, f] of Object.entries(catalogue.fits)) {
    if (!own(catalogue.archetypes, f.archetype)) throw new Error(`${id}: unknown archetype`);
    if (!contract.people.some((p) => p.id === id && p.kind === f.kind)) throw new Error(`${id}: fit does not match people_contract.json`);
  }
  return { catalogue, palette, contract };
}

/** Deterministic text; no imports, IO, textures or automatic outfit selection in the browser table. */
export function wearDataModule(root = ROOT) {
  const { catalogue: c, palette } = wearSources(root);
  const variants = Object.fromEntries(Object.entries(palette.variants).map(([id, v]) => [id, { color: v.color, tile: v.tile, pattern: v.pattern, roughness: v.roughness }]));
  const policy = { schemaVersion: c.schemaVersion, adultOnly: true, defaultEnabled: false, contexts: c.contexts, atlas: c.atlas, limits: c.limits, evidenceBodies: c.evidenceBodies };
  const data = { WEAR_POLICY: policy, WEAR_GARMENTS: Object.fromEntries(c.garments.map((g) => [g.id, g])), WEAR_FITS: c.fits, WEAR_ARCHETYPES: c.archetypes, WEAR_VARIANTS: variants };
  const lines = ['// GENERATED by tools/people_wear_data.mjs from people_wear.catalog.json and the Part A palette.', '// Adult/elder fits only. Importing this table does not enable, fetch or change any resident outfit.', '// Eligibility: WEAR_FITS[id].archetype -> WEAR_ARCHETYPES[archetype].garments;', '// each allowed garment uses WEAR_GARMENTS[garment].variants as its colour set.', '// Regenerate: node la-ladera/tools/people_wear_data.mjs --write-data', '', 'const freeze = (value) => {', "  if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.freeze(value); for (const v of Object.values(value)) freeze(v); }", '  return value;', '};', ''];
  for (const [name, value] of Object.entries(data)) lines.push(`export const ${name} = freeze(${JSON.stringify(value, null, 2)});`, '');
  return lines.join('\n');
}
export const peopleWearDataModule = wearDataModule;

/** The builder measures exported GLBs. This assembler records those measurements and exact hashes. */
export function buildWearManifest(root = ROOT) {
  const { catalogue: c, contract } = wearSources(root), models = join(root, 'assets/models');
  const m = read(join(models, 'wear/metadata.json'));
  if (m.sourcePeopleSha256 !== sha(join(models, 'people/people.glb')) || m.sourceClipBankSha256 !== sha(join(root, 'tools/blender/people_clips.json.gz')) || m.sourceCatalogSha256 !== sha(join(root, 'tools/blender/people_wear.catalog.json'))) throw new Error('wear metadata was built from different source geometry, clips or catalogue');
  checkPeopleWearSourceInputs(m.sourceInputs, root);
  const have = Object.keys(m.fits ?? {}).sort(), want = Object.keys(c.fits).sort();
  if (JSON.stringify(have) !== JSON.stringify(want)) throw new Error('wear metadata must contain every adult fit and no child/teen fit');
  const fits = {};
  for (const id of want) {
    const f = m.fits[id];
    const provenance = f.bodySourceProvenance, report = provenance?.componentsReport;
    if (provenance?.adapter !== 'current-native-body' || report?.path !== `dev/wear/body-provenance/${id}.json` || report.form !== 'LF')
      throw new Error(`${id}: missing current-body component provenance`);
    const reportBytes = Buffer.from(readFileSync(join(root, report.path), 'utf8').replace(/\r\n/g, '\n'));
    if (report.bytes !== reportBytes.length || report.sha256 !== createHash('sha256').update(reportBytes).digest('hex'))
      throw new Error(`${id}: current-body component provenance bytes changed`);
    const { componentsReport, ...summary } = provenance, { components, ...reportedSummary } = JSON.parse(reportBytes);
    if (!Array.isArray(components) || components.length === 0 || JSON.stringify(summary) !== JSON.stringify(reportedSummary))
      throw new Error(`${id}: current-body component provenance summary changed`);
    checkWearAuthoringReports(f, id, root);
    if (JSON.stringify(Object.keys(f.garments ?? {}).sort()) !== JSON.stringify(c.garments.map((g) => g.id).sort())) throw new Error(`${id}: wearable metadata is missing a garment`);
    const path = f.file.startsWith('wear/') ? f.file : `wear/${f.file}`;
    if (!/^wear\/[a-z0-9_]+\.glb(?:\.gz)?$/.test(path)) throw new Error(`${id}: wearable file path is outside the library`);
    if (f.bytes !== statSync(join(models, path)).size || f.sha256 !== sha(join(models, path))) throw new Error(`${id}: exported wearable bytes changed after metadata was written`);
    fits[id] = { ...c.fits[id], ...f, file: path, identityNode: f.identityNode ?? `wear_identity_${id}`, proxyNode: f.proxyNode ?? `wear_proxy_${id}` };
  }
  const files = [];
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const path = join(dir, e.name);
      if (e.isDirectory()) walk(path);
      else {
        const p = relative(models, path).split(sep).join('/');
        files.push({ path: p, ...(/\.glb(?:\.gz)?$/.test(p) ? { glb: p } : {}), bytes: statSync(path).size, sha256: sha(path) });
      }
    }
  };
  walk(join(models, 'wear'));
  return {
    schemaVersion: 1, set: 'people-wear', adultOnly: true, defaultEnabled: false,
    source: c.source, limits: c.limits, atlas: { ...c.atlas, ...(m.atlas?.gpuBytes != null ? { gpuBytes: m.atlas.gpuBytes } : {}) }, palette: c.palette,
    sourcePeopleSha256: m.sourcePeopleSha256, sourceClipBankSha256: m.sourceClipBankSha256,
    sourceInputs: m.sourceInputs,
    sourceContractSha256: sha(join(root, 'tools/blender/people_contract.json')),
    sourceCatalogueSha256: sha(join(root, 'tools/blender/people_wear.catalog.json')),
    sourcePaletteSha256: sha(join(models, c.palette)),
    sourceGarmentManifestSha256: sha(join(models, 'manifest.garments.json')),
    bones: contract.bones, jointOrder: contract.jointOrder, clips: contract.clips,
    contexts: c.contexts, archetypes: c.archetypes, garments: c.garments, fits,
    evidenceBodies: c.evidenceBodies, files,
    ...(m.gpuGeometryBytes != null ? { gpuGeometryBytes: m.gpuGeometryBytes } : {}),
    ...(m.gpuGrowthBytes != null ? { gpuGrowthBytes: m.gpuGrowthBytes } : {}),
    ...(m.gpu ? { gpu: m.gpu } : {}),
    ...(m.collision ? { collision: m.collision } : {}),
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), rootAt = args.indexOf('--root');
  const root = rootAt >= 0 ? resolve(args[rootAt + 1]) : ROOT;
  if (args.includes('--write') || args.includes('--write-data')) {
    writeFileSync(join(root, 'js/people/wear_data.js'), wearDataModule(root));
    if (args.includes('--write')) writeFileSync(join(root, 'assets/models/manifest.people-wear.json'), JSON.stringify(buildWearManifest(root)) + '\n');
  } else process.stdout.write(wearDataModule(root));
}
