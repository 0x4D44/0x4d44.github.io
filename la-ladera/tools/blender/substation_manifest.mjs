// Derive metadata from exported bytes; used by the staged Blender builder.
import '../../tests/nice.mjs';
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT, MODELS, inspectSubstationGlb, sha256, lfBytes, decodePng, gpuBytes } from './substation_validate.mjs';

export function writeSubstationManifest({ models = MODELS, project = ROOT, complete = true, blender = '5.0.1', plans = true } = {}) {
  const catalogBytes = readFileSync(resolve(project, 'tools/blender/substation.catalog.json'));
  const catalogue = JSON.parse(catalogBytes).assets;
  const textureRoot = resolve(models, '../textures/substation');
  const textureMetadataBytes = readFileSync(resolve(textureRoot, 'atlas.json'));
  const atlas = JSON.parse(textureMetadataBytes);
  const files = [];
  for (const name of readdirSync(resolve(models, 'substation')).filter(n => n.endsWith('.glb')).sort()) {
    const path = resolve(models, 'substation', name), bytes = readFileSync(path), decoded = inspectSubstationGlb(bytes, name), assets = {};
    const kinds = new Set();
    for (const [key, a] of decoded.assets) {
      const low = key.endsWith('_lod1'), base = low ? key.slice(0, -5) : key, cat = catalogue[base];
      if (!cat) throw new Error(`Exported root ${key} absent from catalogue`);
      kinds.add(cat.shared ? 'shared' : cat.variant);
      assets[key] = { node: key, size: cat.size, footprint: [cat.size[0], cat.size[2]], origin: 'floor-centre', tags: ['substation', cat.family, ...(low ? ['far-lod'] : [])],
        triangles: a.triangles, parts: a.parts, bounds: { min: a.min, max: a.max }, materials: a.materials,
        pivots: a.pivots.map(p => ({ name: p.name, position: p.position })), repeatedMeshInstances: a.repeatedMeshInstances,
        ...(low ? { lod: 1 } : { lod1: key + '_lod1', description: cat.description }) };
    }
    if (kinds.size !== 1) throw new Error(`Packed file ${name} mixes shared and variant-specific geometry`);
    files.push({ glb: 'substation/' + name, variant: [...kinds][0], bytes: bytes.length, sha256: sha256(bytes), assets });
  }
  const shared = files.find(f => f.variant === 'shared');
  if (!shared) throw new Error('Shared GLB required');
  const variants = {};
  for (const v of ['uk', 'co']) variants[v] = {
    language: v === 'uk' ? 'en' : 'es', voltageKV: v === 'uk' ? [132, 33, 11] : [115, 34.5, 13.2],
    shared: { glb: shared.glb, sha256: shared.sha256 }, files: files.filter(f => f.variant === v).map(f => f.glb),
    signAtlas: '../textures/substation/' + atlas.variants[v].atlas.path,
    materialBindings: atlas.variants[v].materials ?? {},
  };
  const textureFiles = [];
  for (const name of readdirSync(textureRoot).sort()) {
    const b = readFileSync(resolve(textureRoot, name));
    if (name.endsWith('.png')) { const im = decodePng(b); textureFiles.push({ path: '../textures/substation/' + name, bytes: b.length, sha256: sha256(b), width: im.width, height: im.height, gpuBytes: gpuBytes(im.width, im.height) }); }
    else textureFiles.push({ path: '../textures/substation/' + name, bytesLF: lfBytes(b).length, sha256LF: sha256(lfBytes(b)) });
  }
  const planPins = plans ? ['uk', 'co'].map(v => {
    const path = `tools/blender/substation-plan.${v}.json`, b = lfBytes(readFileSync(resolve(project, path)));
    return { variant: v, path, bytesLF: b.length, sha256LF: sha256(b) };
  }) : [];
  const manifest = { version: 1, complete, libraryOnly: true, license: 'CC0-1.0', units: 'metres', axes: { up: '+Y', front: '+Z', origin: 'base-centre' },
    generator: { script: 'tools/blender/substation_build.py', blender, catalogSha256: sha256(lfBytes(catalogBytes)), textPinConvention: 'UTF-8 with CRLF normalized to LF' },
    assetCount: files.reduce((n, f) => n + Object.keys(f.assets).filter(k => !k.endsWith('_lod1')).length, 0),
    lodPolicy: { switchDistanceMetres: 28, cullDistanceMetres: 180, hysteresisMetres: 3, maxFarTriangleRatio: 0.4, oneLodAtATime: true, towerCullDistanceMetres: 900 },
    modelBytes: files.reduce((n, f) => n + f.bytes, 0),
    textureMetadata: { path: '../textures/substation/atlas.json', bytesLF: lfBytes(textureMetadataBytes).length, sha256LF: sha256(lfBytes(textureMetadataBytes)) },
    gpuBytesRGBA8WithMips: textureFiles.reduce((n, f) => n + (f.gpuBytes ?? 0), 0), textures: textureFiles, variants, files, plans: planPins };
  writeFileSync(resolve(models, 'manifest.substation.json'), JSON.stringify(manifest, null, 2) + '\n');
  return manifest;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const a = process.argv.slice(2), val = k => { const i = a.indexOf(k); return i < 0 ? undefined : a[i + 1]; };
  const m = writeSubstationManifest({ models: val('--models'), project: val('--project'), complete: !a.includes('--partial'), blender: val('--blender'), plans: !a.includes('--no-plans') });
  console.log(`Substation manifest: ${m.assetCount} designs, ${m.modelBytes} GLB bytes, ${m.gpuBytesRGBA8WithMips} GPU texture bytes`);
}
