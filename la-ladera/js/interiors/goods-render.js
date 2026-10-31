// Shared, batched shop stock. At most two materials per room/LOD, with real cheaper geometry after 8 m and no tiny stock after 22 m.
import * as THREE from 'three';
import { MeshBuilder } from '../core/mesh.js';
import { GOODS_CATALOG } from './goods-catalog.js';
import { goodsAssetReady, stockedFixtureIds, GOODS_LOD } from './goods.js';

/** Called after normal interior GLB preloading. Texture failures also keep the original procedural stock. */
export async function prepareGoodsAssets(ctx) {
  const all = Object.keys(GOODS_CATALOG), keys = all.filter((key) => goodsAssetReady(ctx, key));
  let atlasReady = false;
  if (keys.length && ctx.matlib?.manifest?.goods_labels?.map) {
    const material = ctx.mat('goods_label');
    await ctx.matlib.whenReady();
    const img = material.map?.image;
    atlasReady = !!(img && (img.naturalWidth ?? img.width) > 0 && (img.naturalHeight ?? img.height) > 0);
  }
  ctx.goodsAssets = { atlasReady, keys, missing: all.filter((key) => !keys.includes(key)), nearDistance: GOODS_LOD.near, cullDistance: GOODS_LOD.cull };
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
  for (const item of goods) if (ready.has(item.parent)) {
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
