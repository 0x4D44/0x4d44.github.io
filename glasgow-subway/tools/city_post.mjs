// Post-process raw Blender GLBs: weld/instance trees, quantize (KHR_mesh_quantization), write to out dir.
// usage: node city_post.mjs RAWDIR OUTDIR   (run from a dir with @gltf-transform installed, e.g. NODE_PATH)
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { quantize, instance, prune, dedup } from '@gltf-transform/functions';
import { KHRTextureTransform } from '@gltf-transform/extensions';
import fs from 'fs'; import path from 'path';
const [raw, out] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
function scaleUV(doc){ const ext=doc.createExtension(KHRTextureTransform); const DIV=128;
  const done=new Set();
  for (const m of doc.getRoot().listMeshes()) for (const p of m.listPrimitives()) { const mt=p.getMaterial(); if(!(mt&&mt.getBaseColorTexture())) continue; const a=p.getAttribute('TEXCOORD_0'); if(!a||done.has(a)) continue; done.add(a);
    const arr=a.getArray(); for(let i=0;i<arr.length;i+=2){ arr[i]=Math.min(arr[i]/DIV,0.9999); arr[i+1]=Math.max((arr[i+1]+DIV/2-1)/DIV,0.0001); } a.setArray(arr); }
  for (const mt of doc.getRoot().listMaterials()) { const ti=mt.getBaseColorTextureInfo(); if(ti) ti.setExtension('KHR_texture_transform', ext.createTransform().setScale([DIV,DIV]).setOffset([0,-(DIV/2-1)])); } }
function stripFlatNormals(doc){ for (const m of doc.getRoot().listMeshes()) if(/^(roads|rail|green|water)_\d/.test(m.getName())) for (const p of m.listPrimitives()) p.setAttribute('NORMAL', null); }
function stripUV(doc){ for (const m of doc.getRoot().listMeshes()) for (const p of m.listPrimitives()) { const mt=p.getMaterial(); if(!(mt&&mt.getBaseColorTexture())) p.setAttribute('TEXCOORD_0', null); } }
for (const f of fs.readdirSync(raw).filter(f => f.endsWith('.glb'))) {
  const doc = await io.read(path.join(raw, f));
  stripUV(doc); stripFlatNormals(doc); scaleUV(doc); await doc.transform(prune(), dedup(), instance({ min: 3 }), quantize({ quantizePosition: 14, quantizeNormal: 8, quantizeColor: 8, quantizeTexcoord: 12, quantizeGeneric: 12 }));
  await io.write(path.join(out, f), doc);
}
