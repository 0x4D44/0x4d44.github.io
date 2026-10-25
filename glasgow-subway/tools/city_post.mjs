// Post-process raw Blender GLBs: weld/instance trees, quantize (KHR_mesh_quantization), write to out dir.
// usage: node city_post.mjs RAWDIR OUTDIR   (run from a dir with @gltf-transform installed, e.g. NODE_PATH)
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { quantize, instance, prune, dedup } from '@gltf-transform/functions';
import fs from 'fs'; import path from 'path';
const [raw, out] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
for (const f of fs.readdirSync(raw).filter(f => f.endsWith('.glb'))) {
  const doc = await io.read(path.join(raw, f));
  await doc.transform(prune(), dedup(), instance({ min: 3 }), quantize({ quantizePosition: 14, quantizeNormal: 8, quantizeColor: 8, quantizeTexcoord: 12, quantizeGeneric: 12 }));
  await io.write(path.join(out, f), doc);
}
