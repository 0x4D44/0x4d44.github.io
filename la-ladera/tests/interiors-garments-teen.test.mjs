// Third-size integration contracts. Existing adult/child tests stay unchanged.
// node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/interiors-garments-teen.test.mjs
// LADERA_TEEN_INTEGRATION_ROOT selects an isolated fixture for the mutation proof.
import test from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseGLB } from '../tools/blender/garments_validate.mjs';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const ROOT = resolve(process.env.LADERA_TEEN_INTEGRATION_ROOT ?? join(dirname(fileURLToPath(import.meta.url)), '..'));
const MODELS = join(ROOT, 'assets/models');
const readJSON = (file) => JSON.parse(readFileSync(file, 'utf8'));
const writeJSON = (file, value) => writeFileSync(file, JSON.stringify(value) + '\n');
const moduleAt = (file) => import(pathToFileURL(join(ROOT, file)).href);
const [{ GARMENTS, GARMENT_FILES, VARIANTS, STATES }, { GARMENT_KEYS, ALL_GARMENT_KEYS, garmentKeysFor, lodFile, registerGarmentAssets },
  { CATALOG }, { garmentsDataModule }, { loadGarmentAssets }, { Assets }] =
  await Promise.all(['js/interiors/garments_data.js', 'js/interiors/garments.js', 'js/interiors/catalog.js', 'tools/garments_data.mjs',
    'js/interiors/build.js', 'js/core/assets.js'].map(moduleAt));
const manifest = readJSON(join(MODELS, 'manifest.garments-teen.json'));
const entries = manifest.files.flatMap((file) => Object.entries(file.assets));
const STYLES = ['tshirt_cream', 'tshirt_teal', 'tshirt_sun', 'shorts_chino', 'crop_top_rib', 'crop_top_boxy',
  'lycra_shorts', 'lycra_trousers', 'denim_shorts', 'denim_jeans', 'dress_short', 'dress_knee', 'dress_midi', 'dress_maxi',
  'hoodie', 'joggers', 'school_jumper', 'school_polo', 'school_trousers', 'school_skirt', 'socks_pair', 'cap',
  'light_jacket', 'underwear_briefs', 'underwear_boxers', 'swim_onepiece', 'swim_shorts', 'school_shoes_pair', 'sandals_pair'];

test('teen integration: registry keeps 29 styles and both sizes without aliases', () => {
  const expected = STYLES.flatMap((style) => ['small', 'big'].map((size) => `teen_${style}_${size}`)).sort();
  const actual = Object.entries(GARMENTS).filter(([, item]) => item.sizeTag === 'teen');
  assert.deepEqual(actual.map(([id]) => id).sort(), expected, 'all 58 distinct teen style/size IDs must be generated');
  assert.equal(entries.length, 162, 'all applicable teen poses are registered');
  assert.equal(new Set(ALL_GARMENT_KEYS).size, ALL_GARMENT_KEYS.length, 'adult, child and teen keys cannot alias');
  assert.equal(GARMENT_KEYS.length, 124, 'retain the existing adult/child preload contract');
  assert.equal(ALL_GARMENT_KEYS.length, 286, 'all three complete libraries remain available');
  assert.equal(garmentKeysFor(['teen']).length, 162, 'teen placements have an explicit key selection');
  for (const [key, asset] of entries) {
    const item = GARMENTS[asset.garment];
    assert.equal(item.sizeTag, 'teen', `${key}: generated sizeTag`);
    assert.equal(item.sizeClass, asset.sizeClass, `${key}: generated sizeClass`);
    assert.equal(item.styleId, asset.styleId, `${key}: generated styleId`);
    assert.equal(asset.garment, `teen_${item.styleId}_${item.sizeClass}`, `${key}: namespace`);
    assert.deepEqual(item[asset.state], [...asset.size.map((v) => Math.round(v * 1000) / 1000), asset.lod.triangles], `${key}: measured pose`);
    assert.ok(ALL_GARMENT_KEYS.includes(key), `${key}: missing runtime key`);
    assert.ok(!GARMENT_KEYS.includes(key), `${key}: teen placements must opt into their pack`);
  }
  for (const size of ['small', 'big']) {
    assert.equal(GARMENTS[`teen_socks_pair_${size}`].hung, undefined, 'sock pairs have no hung pose');
    for (const style of ['school_shoes_pair', 'sandals_pair']) for (const state of ['folded', 'hung']) {
      assert.equal(GARMENTS[`teen_${style}_${size}`][state], undefined, 'rigid footwear retains its pose exceptions');
    }
  }
});

test('teen integration: colours preserve both source palettes', () => {
  const shared = readJSON(join(MODELS, 'garments/palette.json'));
  const teen = readJSON(join(MODELS, 'garments-teen/teen/palette.json'));
  for (const [label, palette] of [['shared', shared], ['teen', teen]]) for (const [id, variant] of Object.entries(palette.variants)) {
    assert.equal(VARIANTS[id], Number.parseInt(variant.color.slice(1), 16), `${label}/${id}: generated tint must match source palette`);
  }
  assert.equal(Object.keys(teen.variants).length, 16, 'retain the original teen fabric tile palette');
  for (const [key, asset] of entries) {
    assert.deepEqual(GARMENTS[asset.garment].v, asset.variants, `${key}: preserve all colour options`);
    for (const variant of asset.variants) assert.ok(Object.hasOwn(teen.variants, variant), `${key}: must use its own library palette`);
  }
});

test('teen integration: loader and catalogue retain sizes and resolve every LOD node', async () => {
  const registered = new Map();
  assert.equal(registerGarmentAssets({ assets: { entries: registered } }), GARMENT_KEYS.length);
  assert.equal(registered.size, 124, 'default registration preserves adult/child consumers');
  assert.equal(registerGarmentAssets({ assets: { entries: registered } }, { sizeTags: ['teen'] }), 162);
  assert.equal(registered.size, ALL_GARMENT_KEYS.length);
  const packs = new Map();
  for (const state of STATES) {
    const file = `garments-teen/garments_${state}_lod.glb`;
    assert.equal(GARMENT_FILES.teen[state], file, `${state}: generated teen pack binding`);
    assert.equal(lodFile(state, 'teen'), file, `${state}: teen loader pack`);
    assert.equal(lodFile(state), GARMENT_FILES.adult[state], `${state}: one-argument adult compatibility`);
    packs.set(file, parseGLB(readFileSync(join(MODELS, file)), file));
  }
  for (const [key, asset] of entries) {
    const entry = registered.get(key), catalogue = CATALOG[key];
    assert.equal(entry.glb, asset.lod.glb, `${key}: registered LOD file`);
    assert.equal(entry.node, `${key}_lod`, `${key}: registered LOD node`);
    for (const [label, value] of [['loader', entry], ['catalogue', catalogue]]) {
      assert.equal(value.sizeTag, 'teen', `${key}: ${label} sizeTag`);
      assert.equal(value.sizeClass, asset.sizeClass, `${key}: ${label} sizeClass`);
      assert.equal(value.styleId, asset.styleId, `${key}: ${label} styleId`);
    }
    assert.ok(entry.tags.includes('teen') && entry.tags.includes(asset.sizeClass), `${key}: registration tags`);
    assert.equal(catalogue.block, false, `${key}: clothing must not become an obstacle`);
    assert.deepEqual(catalogue.size, GARMENTS[asset.garment][asset.state].slice(0, 3), `${key}: catalogue bounds`);
    assert.equal(Object.prototype.propertyIsEnumerable.call(CATALOG, key), false, `${key}: library registration must not add furniture placements`);
    const pack = packs.get(entry.glb), root = pack.json.nodes.find((node) => node.name === entry.node);
    assert.ok(root && pack.roots.some((index) => pack.json.nodes[index] === root), `${key}: independently decoded LOD scene root`);
    const meshes = [], visit = (node) => {
      if (node.mesh !== undefined) meshes.push(node);
      for (const child of node.children ?? []) visit(pack.json.nodes[child]);
    };
    visit(root);
    assert.ok(meshes.length > 0 && meshes.every((node) => /-tint-0(?:-|$)/.test(node.name)), `${key}: renderer tint convention must survive packing`);
  }
  const ctx = { errors: [] }, requested = [], gltfs = new GLTFLoader();
  ctx.assets = new Assets(ctx);
  ctx.assets.load = async (path) => {
    requested.push(path);
    const bytes = readFileSync(join(MODELS, path));
    const gltf = await gltfs.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
    gltf.scene.updateMatrixWorld(true); ctx.assets.loaded.set(path, gltf); return gltf;
  };
  await loadGarmentAssets(ctx, { sizeTags: ['teen'] });
  assert.deepEqual(requested.sort(), STATES.map((state) => `garments-teen/garments_${state}_lod.glb`).sort(), 'explicit teen load requests exactly its three LOD packs');
  assert.deepEqual([...ctx.garmentGlb].sort(), entries.map(([key]) => key).sort(), 'all 162 real teen models must load through the production loader');
  assert.deepEqual(ctx.errors, [], 'interleaved teen geometry must pass the runtime mesh checks');
  assert.equal(ctx.interiorGlb, undefined, 'teen loading must leave the furniture load alone');
  requested.length = 0;
  await loadGarmentAssets(ctx);
  assert.deepEqual([...ctx.garmentGlb].sort(), [...GARMENT_KEYS].sort(), 'default reload restores only the existing adult/child set');
  assert.ok(requested.every((path) => !path.startsWith('garments-teen/')), 'default reload must not request teen packs');
  assert.ok([...ctx.interiorGlbParts.keys()].every((key) => !key.startsWith('garment_teen_')), 'switching size libraries disposes stale teen mesh parts');
});

function generatorFixture(t) {
  const models = mkdtempSync(join(tmpdir(), 'ladera-teen-generator-'));
  t.after(() => rmSync(models, { recursive: true, force: true }));
  for (const file of ['manifest.garments.json', 'manifest.garments-child.json', 'manifest.garments-teen.json',
    'garments/palette.json', 'garments/assortments.json', 'garments-teen/teen/palette.json']) {
    mkdirSync(dirname(join(models, file)), { recursive: true });
    cpSync(join(MODELS, file), join(models, file));
  }
  return models;
}

test('teen integration: generator rejects wrong size metadata and aliases', (t) => {
  const models = generatorFixture(t), file = join(models, 'manifest.garments-teen.json');
  const original = readJSON(file), firstKey = Object.keys(original.files[0].assets)[0];
  for (const [label, mutate, message] of [
    ['wrong manifest size', (m) => { m.sizeTag = 'child'; }, /expected sizeTag 'teen'/],
    ['wrong asset size', (m) => { m.files[0].assets[firstKey].sizeTag = 'adult'; }, /sizeTag must be 'teen'/],
    ['wrong size class', (m) => { m.files[0].assets[firstKey].sizeClass = 'adult'; }, /invalid teen style, size class or scale/],
    ['wrong scale', (m) => { m.files[0].assets[firstKey].scale = 1; }, /invalid teen style, size class or scale/],
    ['missing namespace', (m) => {
      const asset = m.files[0].assets[firstKey]; delete m.files[0].assets[firstKey];
      asset.garment = asset.garment.slice(5); m.files[0].assets[`garment_${asset.garment}_${asset.state}`] = asset;
    }, /teen_ IDs belong only/],
    ['wrong library palette', (m) => { m.files[0].assets[firstKey].variants = ['plain_cream']; }, /unknown or empty palette variants/],
  ]) {
    const mutant = structuredClone(original); mutate(mutant); writeJSON(file, mutant);
    assert.throws(() => garmentsDataModule(models), message, label);
  }
});

test('teen integration: generator rejects palette name collisions', (t) => {
  const models = generatorFixture(t), file = join(models, 'garments-teen/teen/palette.json'), palette = readJSON(file);
  palette.variants.plain_cream = { ...palette.variants.jersey_cream, color: '#123456' };
  writeJSON(file, palette);
  assert.throws(() => garmentsDataModule(models), /palette variant plain_cream conflicts/, 'a teen tint must never replace an adult or child tint');
});
