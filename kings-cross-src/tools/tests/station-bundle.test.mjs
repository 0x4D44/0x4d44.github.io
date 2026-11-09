import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import {build} from 'vite';

// Integration check on emitted code, not source-string matching: optional 3D landmark
// geometry must cross a real lazy boundary, leaving the main chunk below its existing budget.
test('landmark geometry is lazy and the station entry stays below the unchanged 1200 kB limit',async()=>{
 const pkg=path.resolve(import.meta.dirname,'../..');
 const result=await build({configFile:path.join(pkg,'vite.config.ts'),root:path.join(pkg,'web'),logLevel:'silent',
   build:{write:false,emptyOutDir:false}});
 const chunks=result.output.filter(x=>x.type==='chunk');
 const entry=chunks.find(x=>x.isEntry);
 const landmarks=chunks.find(x=>x.moduleIds.some(id=>id.endsWith('/web/src/landmarks.ts')));
 assert.ok(entry&&landmarks,'station entry and landmark geometry emitted');
 assert.notEqual(landmarks.fileName,entry.fileName,'landmark geometry is still in the main entry');
 assert.equal(landmarks.isDynamicEntry,true,'geometry is actually deferred, not merely an eager shared chunk');
 assert.ok(chunks.some(x=>x.dynamicImports.includes(landmarks.fileName)),'landmark module has a dynamic importer');
 assert.ok(Buffer.byteLength(entry.code)<1200_000,`main chunk is ${Buffer.byteLength(entry.code)} bytes`);
});
