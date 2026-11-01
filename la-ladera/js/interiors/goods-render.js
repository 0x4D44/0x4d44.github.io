// Shared, batched shop stock. At most two materials per room/LOD, with real cheaper geometry after 8 m and no tiny stock after 22 m.
import * as THREE from 'three';
import { MeshBuilder } from '../core/mesh.js';
import { CATALOG } from './catalog.js';
import { layoutOf } from './carcass.js';
import { GOODS_CATALOG } from './goods-catalog.js';
import { goodsAssetReady, stockedFixtureIds, GOODS_LOD } from './goods.js';

/**
 * The page's loader (index.js loadInteriorAssets). The shop goods are a library of their own (assets/models/goods, manifest.goods.json), listed in assets/models/manifest.json: their keys are in the
 * asset registry and in the interior catalogue (hidden there like the clothes, `ware: true`), so build.js leaves them out of the furniture roots and this loads them: one GLB, one atlas.
 * A file or atlas that fails leaves every fixture with its own stock (see prepareGoodsAssets): nothing is requested twice, nothing is ever half-replaced.
 */
export async function loadGoodsAssets(ctx) {
  for (const parts of ctx.interiorGoodsParts?.values() ?? []) for (const p of parts) p.geometry.dispose();
  ctx.interiorGoodsParts = new Map();
  const all = Object.keys(GOODS_CATALOG);
  ctx.goodsAssets = { atlasReady: false, keys: [], missing: all, nearDistance: GOODS_LOD.near, cullDistance: GOODS_LOD.cull };
  const a = ctx.assets;
  if (!a?.has || !all.some((key) => a.has(key))) return ctx.goodsAssets;
  if (ctx.matlib?.manifest?.goods_labels?.map) ctx.mat?.('goods_label');                 // the label atlas comes down beside the model, not after it (and prepareGoodsAssets then waits for this one file, not for every texture of the boot)
  try { await a.preload(all); } catch (e) { (ctx.errors ??= []).push({ stage: 'goods', message: 'preload ' + String(e?.message ?? e) }); }
  return prepareGoodsAssets(ctx);
}

/** After the goods GLB is loaded. Texture failures also keep the original procedural stock. */
export async function prepareGoodsAssets(ctx) {
  const all = Object.keys(GOODS_CATALOG), keys = all.filter((key) => goodsAssetReady(ctx, key));
  let atlasReady = false;
  if (keys.length && ctx.matlib?.manifest?.goods_labels?.map) {
    const material = ctx.mat('goods_label');
    await (ctx.matlib.whenLoaded?.(material.map) ?? ctx.matlib.whenReady());
    const img = material.map?.image;
    atlasReady = !!(img && (img.naturalWidth ?? img.width) > 0 && (img.naturalHeight ?? img.height) > 0);
  }
  ctx.goodsAssets = { atlasReady, keys, checked: new Set(keys), missing: all.filter((key) => !keys.includes(key)), nearDistance: GOODS_LOD.near, cullDistance: GOODS_LOD.cull };
  return ctx.goodsAssets;
}

/** Flatten each GLB node just once. Names resolve through the manifest; no assumed adjacency/order of meshes. */
export function goodsParts(ctx, key, far = false) {
  const entry = ctx.assets.meta(key), nodeName = far ? entry.lodNode : entry.node ?? key;
  const cache = (ctx.interiorGoodsParts ??= new Map()), cacheKey = entry.glb + ':' + nodeName;
  if (cache.has(cacheKey)) return cache.get(cacheKey);
  const scene = ctx.assets.loaded.get(entry.glb)?.scene, node = scene?.getObjectByName(nodeName);
  if (!node) return [];
  const inverse = new THREE.Matrix4().copy(node.matrixWorld).invert(), matrix = new THREE.Matrix4(), parts = [];
  node.traverse((object) => {
    if (!object.isMesh) return;
    const material = Array.isArray(object.material) ? object.material[0] : object.material;
    parts.push({ geometry: object.geometry.clone().applyMatrix4(matrix.multiplyMatrices(inverse, object.matrixWorld)), matKey: material.name });
  });
  cache.set(cacheKey, parts);
  return parts;
}

const M = new THREE.Matrix4();

/**
 * Build before drawing the fixtures. Only rooms fully built here return replacement IDs, so even an unexpected geometry failure
 * leaves procedural contents intact. LOD positions are WORLD centres, not building origins; their meshes use that local frame.
 */
export function buildGoods(ctx, bp, interiorGroup) {
  const goods = bp.goods ?? [], ready = stockedFixtureIds(ctx, goods), replaced = new Set(), rooms = new Map();
  const stats = { planned: goods.length, drawn: 0, fixtures: 0, rooms: 0, nearTriangles: 0, farTriangles: 0, nearCalls: 0, farCalls: 0,
    nearDistance: GOODS_LOD.near, cullDistance: GOODS_LOD.cull };
  // The stock is measured on what the page draws for the piece: its model (data/goods-assortments.js), or the carcass stand-in of a piece that opens. A piece whose model did not load is drawn
  // by its plain stand-in, whose boards are elsewhere: it keeps its own stock rather than get goods floating over or sunk into it.
  const nameOf = new Map((bp.furniture ?? []).map((r) => [r.id, r.name]));
  const drawnAsMeasured = (id) => { const c = CATALOG[nameOf.get(id)]; return !!c && (!!layoutOf(c) || !!ctx.interiorGlb?.has(c.name)); };
  for (const item of goods) if (ready.has(item.parent) && drawnAsMeasured(item.parent)) {
    let list = rooms.get(item.room); if (!list) rooms.set(item.room, list = []);
    list.push(item);
  }
  const lot = bp.lot ?? {};
  for (const [room, items] of rooms) {
    const near = new MeshBuilder(), far = new MeshBuilder();
    near.setBasePose(lot.x ?? 0, lot.y ?? 0, lot.z ?? 0, lot.rotY ?? 0);
    far.setBasePose(lot.x ?? 0, lot.y ?? 0, lot.z ?? 0, lot.rotY ?? 0);
    const lod = new THREE.LOD(), nearObject = new THREE.Group(), farObject = new THREE.Group(), hidden = new THREE.Group();
    const label = `${bp.id}.goods.${room}`;
    lod.name = label; nearObject.name = label + '.near'; farObject.name = label + '.far'; hidden.name = label + '.culled';
    try {
      for (const item of items) {
        M.makeRotationY(item.ry ?? 0).setPosition(item.x, item.y, item.z);
        for (const part of goodsParts(ctx, item.name)) near.geometry(part.matKey, part.geometry, M);
        for (const part of goodsParts(ctx, item.name, true)) far.geometry(part.matKey, part.geometry, M);
      }
      const nearTriangles = near.tris, farTriangles = far.tris;
      const nearMeshes = near.flush(nearObject, ctx, { name: nearObject.name, cast: false, receive: true });
      const farMeshes = far.flush(farObject, ctx, { name: farObject.name, cast: false, receive: true });
      const bounds = new THREE.Box3();
      for (const mesh of nearMeshes) bounds.union(mesh.geometry.boundingBox);
      const centre = bounds.getCenter(new THREE.Vector3());
      for (const mesh of [...nearMeshes, ...farMeshes]) {
        mesh.geometry.translate(-centre.x, -centre.y, -centre.z);
        mesh.geometry.computeBoundingBox(); mesh.geometry.computeBoundingSphere();
        mesh.userData.goods = true; mesh.castShadow = false;
      }
      lod.position.copy(centre);
      lod.addLevel(nearObject, 0).addLevel(farObject, GOODS_LOD.near, 0.08).addLevel(hidden, GOODS_LOD.cull, 0.08);
      farObject.visible = hidden.visible = false;
      lod.userData.goods = { room, records: items.length, nearTriangles, farTriangles, nearCalls: nearMeshes.length, farCalls: farMeshes.length };
      interiorGroup.obj.add(lod);
      for (const item of items) replaced.add(item.parent);
      stats.drawn += items.length; stats.rooms++; stats.nearTriangles += nearTriangles; stats.farTriangles += farTriangles;
      stats.nearCalls += nearMeshes.length; stats.farCalls += farMeshes.length;
    } catch (error) {
      for (const object of [nearObject, farObject]) object.traverse((m) => { if (m.isMesh) m.geometry.dispose(); });
      (ctx.errors ??= []).push({ stage: 'goods', building: bp.id, room, message: String(error?.message ?? error) });
    }
  }
  stats.fixtures = replaced.size;
  return { replaced, stats };
}
