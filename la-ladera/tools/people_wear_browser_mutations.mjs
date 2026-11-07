// Mutation evidence for the unchanged PR85 browser assertions and actual draws.
// No shipped file is edited. Faults run in a private gallery copy; asset inputs
// are read through task-owned directory links. A fresh passing full four-sheet
// baseline and its complete input snapshot are mandatory before any browser run.
import '../tests/nice.mjs';
import { readFile, writeFile, mkdir, mkdtemp, symlink } from 'node:fs/promises';
import { resolve, dirname, relative, isAbsolute } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { launch } from '../tests/chrome.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const LADERA = resolve(ROOT, 'la-ladera');
const GALLERY = 'la-ladera/tests/people-wear-gallery.mjs';
const SHOTS = 'la-ladera/tests/people-wear-shots.mjs';
const args = process.argv.slice(2);
const option = (name, fallback) => { const i = args.indexOf('--' + name); return i < 0 ? fallback : args[i + 1]; };
const need = (condition, message) => { if (!condition) throw new Error(message); };
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const posix = path => relative(ROOT, path).split('\\').join('/');
const write = async (path, value) => { await mkdir(dirname(path), {recursive:true}); await writeFile(path, JSON.stringify(value, null, 2) + '\n'); };
const readLF = async path => (await readFile(resolve(ROOT, path), 'utf8')).replace(/\r\n/g, '\n');
const gallery = await readLF(GALLERY), shots = await readLF(SHOTS);
const mark = id => `window.__wearMutationApplied.push(${JSON.stringify(id)}); console.info(${JSON.stringify('[wear-browser-mutation-applied:' + id + ']')}); `;
const texture = `const fixtureTexture = new THREE.DataTexture(new Uint8Array([255, 127, 0, 255]), 1, 1); fixtureTexture.needsUpdate = true; renderer.initTexture(fixtureTexture); `;
const drawSpec = {lod:0, clip:'idle_a', phase:0.27, ids:['tshirt']};
const cases = [
  {id:'gallery-missing-clip', test:'gallery rejects an unavailable requested clip', entry:'render', render:drawSpec, error:'missing clip idle_a',
   from:'const action = library.play(inst, name, {fade: 0, time: phase});', to:'const action = null; __MARK__'},
  {id:'gallery-unknown-garment', test:'gallery rejects an unknown rendered garment', entry:'render', render:drawSpec, error:'empty or unknown garment render request',
   from:'const entries = ids ? ids.map(id => wear.garments.get(id)) : wear.manifest.garments;', to:'__MARK__ const entries = [undefined];'},
  {id:'gallery-invalid-scale', test:'gallery rejects an invalid preview scale', entry:'render', render:drawSpec, error:'invalid preview scale',
   // Inject before the existing guard, leaving the guard itself byte-for-byte.
   before:"  assert(Number.isFinite(scale) && scale >= 1 && scale <= 3, 'invalid preview scale');", inject:'__MARK__ scale = 0;\n'},
  {id:'gallery-original-skeleton', test:'gallery preserves the resident skeleton when dressing', entry:'runtime', error:'wardrobe replaced original skeleton',
   before:'    assert(inst.mesh === original.mesh && inst.mesh.skeleton === original.skeleton, `${id}: wardrobe replaced original skeleton`);',
   inject:'__MARK__ inst.mesh.skeleton = inst.mesh.skeleton.clone();\n'},
  {id:'gallery-runtime-lod', test:'gallery checks both requested runtime LODs', entry:'runtime', error:'LOD did not reach wardrobe',
   from:'library.setLod(inst, lod); assert(inst.lod === lod, `${id}: LOD did not reach wardrobe`);',
   to:'library.setLod(inst, lod); __MARK__ inst.lod = -1; assert(inst.lod === lod, `${id}: LOD did not reach wardrobe`);'},
  {id:'gallery-skeleton-size', test:'gallery rejects a wearable skeleton with missing bones', entry:'runtime', error:'wearable skeleton size',
   before:'            assert(mesh.skeleton.bones.length === BONES.length, `${id}: wearable skeleton size`);', inject:'__MARK__ mesh.skeleton.bones.pop();\n'},
  {id:'gallery-deformation', test:'gallery rejects nonfinite posed wearable vertices', entry:'runtime', error:'invalid wearable skin deformation',
   from:'mesh.getVertexPosition(used[v], vector);', to:'mesh.getVertexPosition(used[v], vector); __MARK__ vector.x = Infinity;'},
  {id:'gallery-restore-look', test:'gallery restores the exact original resident appearance', entry:'runtime', error:'restore changed the original look',
   before:'    assert(inst.mesh === original.mesh && inst.mesh.geometry === original.geometry && inst.mesh.material === original.material && inst.mesh.visible === original.visible && inst.mesh.skeleton === original.skeleton, `${id}: restore changed the original look`);',
   inject:'__MARK__ inst.mesh.visible = !original.visible;\n'},
  {id:'gallery-restore-active', test:'gallery removes active wardrobe state on restoration', entry:'runtime', error:'restore left wardrobe active',
   before:'    assert(!inst.wear, `${id}: restore left wardrobe active`);', inject:'__MARK__ inst.wear = {fixture:true};\n'},
  {id:'gallery-clip-coverage', test:'gallery requires all thirty-two original clips', entry:'runtime', error:'not all 32 original clips loaded',
   before:'  const report = {fits: PEOPLE, clips: [...library.clips.keys()], checks: [], posedVertices: 0};',
   inject:'__MARK__ library.clips.delete([...library.clips.keys()][0]);\n'},
  {id:'gallery-shared-atlas', test:'gallery detects an extra real GPU texture allocation', entry:'sharing', error:'GPU images; expected one shared atlas',
   before:'  const wardrobeTextures = renderer.info.memory.textures, addedTextures = wardrobeTextures - baselineTextures;', inject:'__MARK__ ' + texture + '\n'},
  {id:'gallery-disposal-baseline', test:'gallery requires a recorded GPU baseline for disposal', entry:'disposal', error:'GPU baseline must be recorded before final disposal',
   before:"  assert(baselineGpu, 'GPU baseline must be recorded before final disposal');", inject:'__MARK__ baselineGpu = null;\n'},
  {id:'gallery-buffer-leak', test:'gallery detects an actual leaked WebGL buffer', entry:'disposal', error:'WebGL buffers allocated',
   from:'  wear.dispose();', to:'  wear.dispose(); __MARK__ gl.createBuffer();'},
  {id:'gallery-original-buffer', test:'gallery detects deletion of an original resident WebGL buffer', entry:'disposal', error:'original WebGL buffers',
   from:'  wear.dispose();', to:'  wear.dispose(); __MARK__ gl.deleteBuffer([...baselineGpu.buffers][0]);'},
  {id:'gallery-texture-disposal', test:'gallery detects a retained GPU texture after disposal', entry:'disposal', error:'wardrobe texture disposal did not return to baseline',
   from:'  wear.dispose();', to:'  wear.dispose(); __MARK__ ' + texture},
  {id:'gallery-geometry-disposal', test:'gallery detects a retained geometry registration without new buffers', entry:'disposal', error:'wardrobe geometry disposal did not return to baseline',
   from:'  wear.dispose();', to:'  wear.dispose(); __MARK__ const fixtureGeometry = new THREE.BufferGeometry(); for (const [name, attribute] of Object.entries(floor.geometry.attributes)) fixtureGeometry.setAttribute(name, attribute); fixtureGeometry.setIndex(floor.geometry.index); const fixtureMesh = new THREE.Mesh(fixtureGeometry, floor.material); scene.add(fixtureMesh); renderer.render(scene, camera); scene.remove(fixtureMesh);'},
  {id:'draw-lod', test:'actual contact draws use the requested body and garment LOD indices', entry:'observed-render', render:{...drawSpec,lod:1}, error:'WEAR_DRAW_LOD',
   from:"wear.dress(inst, selection, {context: 'studio'}); library.setLod(inst, lod); pose(inst, clip, phase);",
   to:"wear.dress(inst, selection, {context: 'studio'}); __MARK__ library.setLod(inst, 0); pose(inst, clip, phase);"},
  {id:'draw-clip', test:'actual contact draws use the requested animation clip', entry:'observed-render', render:{...drawSpec,clip:'walk',phase:0.19}, error:'WEAR_DRAW_CLIP',
   from:"wear.dress(inst, selection, {context: 'studio'}); library.setLod(inst, lod); pose(inst, clip, phase);",
   to:"wear.dress(inst, selection, {context: 'studio'}); library.setLod(inst, lod); __MARK__ pose(inst, 'idle_a', phase);"},
  {id:'draw-phase', test:'actual contact draws use the requested animation phase', entry:'observed-render', render:{...drawSpec,clip:'sit_idle',phase:0.25}, error:'WEAR_DRAW_PHASE',
   from:"wear.dress(inst, selection, {context: 'studio'}); library.setLod(inst, lod); pose(inst, clip, phase);",
   to:"wear.dress(inst, selection, {context: 'studio'}); library.setLod(inst, lod); __MARK__ pose(inst, clip, 0);"},
  {id:'draw-bone-pose', test:'actual contact draw bone matrices match an independently posed source resident', entry:'observed-render', render:{...drawSpec,clip:'walk',phase:0.19}, error:'WEAR_DRAW_BONES',
   from:'assert(action, `missing clip ${name}`); inst.mixer.update(0);', to:'assert(action, `missing clip ${name}`); __MARK__ /* fixture omits the mixer evaluation */'},
  {id:'draw-garment', test:'actual contact draws contain their labelled target garment', entry:'observed-render', render:drawSpec, error:'WEAR_DRAW_GARMENT',
   from:"wear.dress(inst, selection, {context: 'studio'}); library.setLod(inst, lod); pose(inst, clip, phase);",
   to:"__MARK__ wear.dress(inst, outfit(wear.garments.get('dress')), {context: 'studio'}); library.setLod(inst, lod); pose(inst, clip, phase);"},
  {id:'draw-design-coverage', test:'contact drawing covers all twenty-three designs on all three evidence fits', entry:'observed-render', render:{lod:0,clip:'idle_a',phase:0.27}, error:'WEAR_DRAW_COVERAGE',
   from:'const entries = ids ? ids.map(id => wear.garments.get(id)) : wear.manifest.garments;',
   to:'__MARK__ const entries = (ids ? ids.map(id => wear.garments.get(id)) : wear.manifest.garments).slice(1);'},
  {id:'driver-exception', test:'shot driver rejects actual uncaught browser exceptions', entry:'diagnostics', fault:'exception', error:'wardrobe gallery produced browser diagnostics'},
  {id:'driver-network', test:'shot driver rejects actual failed asset requests', entry:'diagnostics', fault:'network', error:'wardrobe gallery produced browser diagnostics'},
  {id:'driver-console-error', test:'shot driver rejects actual browser console errors', entry:'diagnostics', fault:'console-error', error:'wardrobe gallery produced browser diagnostics'},
  {id:'driver-console-warning', test:'shot driver rejects actual unexpected browser warnings', entry:'diagnostics', fault:'console-warning', error:'wardrobe gallery produced browser diagnostics'},
  {id:'driver-input-fingerprint', test:'shot driver rejects changed asset bytes after its baseline', entry:'fingerprint', error:'assets changed during contact-sheet verification'},
];

function sourceFor(row) {
  if (!row?.from && !row?.before) return gallery;
  const anchor = row.before ?? row.from;
  need(gallery.split(anchor).length === 2, row.id + ': gallery mutation anchor is missing or nonunique');
  const replacement = row.before ? row.inject.replaceAll('__MARK__', mark(row.id)) + row.before : row.to.replaceAll('__MARK__', mark(row.id));
  return gallery.replace(anchor, replacement);
}

// This observer is appended only to the private gallery. It observes the actual
// completed renderer call, then evaluates the same source clip on a fresh,
// undressed resident. The original pose, rendering and assertions remain intact.
const observer = `
window.__wearMutationApplied = [];
window.__wearMutationDraws = [];
const mutationOriginalRender = renderer.render.bind(renderer);
renderer.render = (...args) => {
  const result = mutationOriginalRender(...args), expected = window.__wearMutationExpected;
  if (!expected) return result;
  for (const [id, inst] of instances) {
    if (inst.root.parent !== args[0]) continue;
    const reference = library.instantiate(id), sourceClip = library.clips.get(expected.clip);
    const action = reference.mixer.clipAction(sourceClip);
    action.reset(); action.play(); action.time = expected.phase * sourceClip.duration;
    reference.mixer.update(0); reference.root.updateMatrixWorld(true); reference.mesh.skeleton.update();
    const actualBones = inst.mesh.skeleton.boneMatrices, expectedBones = reference.mesh.skeleton.boneMatrices;
    let boneDifference = actualBones.length === expectedBones.length ? 0 : Infinity;
    for (let i = 0; i < expectedBones.length; i++) boneDifference = Math.max(boneDifference, Math.abs(actualBones[i] - expectedBones[i]));
    reference.mixer.stopAllAction(); reference.mixer.uncacheRoot(reference.obj);
    const state = inst.wear;
    window.__wearMutationDraws.push({id, lod:inst.lod, clip:inst.cur?.getClip().name, phase:inst.cur?.time / inst.cur?.getClip().duration,
      bodyLod:inst.mesh.geometry === (expected.lod ? state.fit.bodyLod : state.fit.body).geometry,
      garments:state.meshes.map(item => ({id:item.id, indexLod:item.mesh.geometry.index === (expected.lod ? item.source.far : item.source.near).geometry.index})),
      boneDifference, boneCount:expectedBones.length});
  }
  return result;
};
`;
const diagnosticsLine = shots.split('\n').find(line => line.includes("throw new Error('wardrobe gallery produced browser diagnostics:"));
const fingerprintLine = shots.split('\n').find(line => line.includes("throw new Error('assets changed during contact-sheet verification')"));
const hashStart = shots.indexOf('async function hashes() {'), hashEnd = shots.indexOf('\nconst report = ', hashStart);
need(diagnosticsLine && fingerprintLine && hashStart >= 0 && hashEnd > hashStart, 'original shot-driver guard or hash function changed');
const diagnosticsGuard = new Function('diagnostics', diagnosticsLine);
const AsyncFunction = Object.getPrototypeOf(async function() {}).constructor;
const fingerprintGuard = new AsyncFunction('hashes', 'report', fingerprintLine);
const manifestURL = pathToFileURL(resolve(LADERA, 'assets/models/manifest.people-wear.json'));
const hashFunction = read => new Function('readFile','createHash','manifestURL', shots.slice(hashStart,hashEnd) + '\nreturn hashes;')(read,createHash,manifestURL);

for (const row of cases) sourceFor(row);
need(new Set(cases.map(row => row.id)).size === cases.length, 'duplicate browser mutation ID');
if (args.includes('--list')) {
  console.log(JSON.stringify({schema:1,node:process.version,tests:cases.length,mutants:cases.length,originalAssertions:16,drawObservations:6,shotDriverGuards:5,
    sourcePins:[{path:GALLERY,form:'LF',sha256:sha(gallery)},{path:SHOTS,form:'LF',sha256:sha(shots)}],
    cases:cases.map(({id,test,entry,error}) => ({id,test,entry,error}))},null,2));
  process.exit(0);
}
need(process.version === 'v22.16.0', 'exact Node v22.16.0 is required');
need(option('baseline') && option('baseline-inputs'), 'a passing original four-sheet --baseline and its --baseline-inputs snapshot are required');
const out = resolve(ROOT, option('out','la-ladera/dev/wear/browser-mutation-proof'));
const outputRelative = relative(resolve(LADERA,'dev'),out);
need(outputRelative && !outputRelative.startsWith('..') && !isAbsolute(outputRelative), 'browser proof output must stay under la-ladera/dev');
const baselinePath = resolve(ROOT,option('baseline')), baselineInputsPath = resolve(ROOT,option('baseline-inputs'));
const baseline = JSON.parse(await readFile(baselinePath,'utf8')), baselineInputs = JSON.parse(await readFile(baselineInputsPath,'utf8'));
const expectedSheets = [['contact-near.jpg',0,'idle_a',0.27],['contact-far.jpg',1,'idle_a',0.27],['contact-walk.jpg',0,'walk',0.19],['contact-seated.jpg',0,'sit_idle',0.25]];
need(baseline.ok && baseline.failures.length === 0 && baseline.runtime?.clips.length === 32 && baseline.gpuSharing?.addedTextures === 1 && baseline.disposal?.leakedBuffers === 0 && baseline.disposal?.lostOriginalBuffers === 0,
  'the original complete browser baseline did not pass runtime, GPU and disposal checks');
need(JSON.stringify(baseline.sheets.map(row => [row.file,row.lod,row.clip,row.phase])) === JSON.stringify(expectedSheets), 'baseline lacks the four exact requested sheets');
need(baseline.sheets.every(row => row.rows.length === 23 && row.rows.every(r => JSON.stringify(r.fits.map(f => f.id)) === JSON.stringify(['w_joven','m_tendero','w_vecina']))), 'baseline omits a design or evidence fit');
need(JSON.stringify(await hashFunction(readFile)()) === JSON.stringify(baseline.assetHashes), 'baseline assets differ from current assets');
need(Array.isArray(baselineInputs.files) && baselineInputs.files.some(row => row.path === GALLERY) && baselineInputs.files.some(row => row.path === SHOTS), 'baseline lacks complete source fingerprints');
async function snapshot() {
  const rows=[];
  for (const row of baselineInputs.files) {
    const raw=await readFile(resolve(ROOT,row.path)), data=row.form === 'LF' ? Buffer.from(raw.toString('utf8').replace(/\r\n/g,'\n')) : raw;
    need(data.length === row.bytes && sha(data) === row.sha256, row.path + ': baseline input changed');
    rows.push({...row,checkoutBytes:raw.length,checkoutSha256:sha(raw)});
  }
  return rows;
}
const initial = await snapshot();
const manifest = JSON.parse(await readFile(manifestURL,'utf8'));
const garmentIds = manifest.garments.map(row => row.id);
await mkdir(resolve(LADERA,'.scratch'),{recursive:true});
const stage = await mkdtemp(resolve(LADERA,'.scratch/wear-browser-mutations-'));
await mkdir(resolve(stage,'la-ladera/tests'),{recursive:true});
for (const name of ['assets','js','vendor']) await symlink(resolve(LADERA,name),resolve(stage,'la-ladera',name),process.platform === 'win32' ? 'junction' : 'dir');
await writeFile(resolve(stage,'la-ladera/tests/people-wear-gallery.html'),await readFile(resolve(LADERA,'tests/people-wear-gallery.html')));
await write(resolve(out,'inputs-start.json'),initial);
const report = {schema:1,node:process.version,startedAt:new Date().toISOString(),complete:false,ok:false,
  baseline:{report:posix(baselinePath),sha256:sha(await readFile(baselinePath)),inputs:posix(baselineInputsPath),inputSha256:sha(await readFile(baselineInputsPath))},
  sourcePins:[{path:GALLERY,form:'LF',sha256:sha(gallery)},{path:SHOTS,form:'LF',sha256:sha(shots)}],stage:posix(stage),
  coverage:{originalAssertions:16,drawObservations:6,shotDriverGuards:5},controls:[],mutants:[]};
const controls = new Map();
let browser, sequence=0;

function controlKey(row) { return row.entry === 'diagnostics' ? 'diagnostics' : JSON.stringify([row.entry,row.render ?? null]); }
function observedSheet(sheet, draws, spec) {
  const expectedIds=spec.ids ?? garmentIds;
  need(JSON.stringify(sheet.rows.map(row => row.garment)) === JSON.stringify(expectedIds) && draws.length === expectedIds.length * 3,'WEAR_DRAW_COVERAGE: missing or unexpected design/fit draw');
  for (let index=0;index<draws.length;index++) {
    const draw=draws[index], expectedId=['w_joven','m_tendero','w_vecina'][index%3], garment=expectedIds[Math.floor(index/3)];
    need(draw.id === expectedId,'WEAR_DRAW_COVERAGE: draw fit order changed');
    need(draw.lod === spec.lod && draw.bodyLod && draw.garments.every(item => item.indexLod),'WEAR_DRAW_LOD: requested body/garment index streams were not drawn');
    need(draw.clip === spec.clip,'WEAR_DRAW_CLIP: a different clip was drawn');
    need(Number.isFinite(draw.phase) && Math.abs(draw.phase-spec.phase) <= 1e-12,'WEAR_DRAW_PHASE: a different phase was drawn');
    need(draw.garments.some(item => item.id === garment),'WEAR_DRAW_GARMENT: labelled target was absent from the draw');
    need(draw.boneCount > 0 && Number.isFinite(draw.boneDifference) && draw.boneDifference <= 1e-6,'WEAR_DRAW_BONES: uploaded bones differ from the independently posed source resident');
  }
}

async function runCase(row, mutation) {
  const result={id:mutation ? row.id : 'control-'+controls.size,test:row.test,entry:row.entry,mutation,applied:false,passed:false,error:null,expectedError:row.error};
  const started=Date.now();
  try {
    if (row.entry === 'fingerprint') {
      const expected=await hashFunction(readFile)();
      const read=async (...values) => {
        const bytes=await readFile(...values);
        if (mutation && values[0].pathname.endsWith('/people/people_meta.json')) { result.applied=true; return Buffer.concat([bytes,Buffer.from('\n')]); }
        return bytes;
      };
      await fingerprintGuard(hashFunction(read),{assetHashes:expected});
    } else {
      const source=(mutation ? sourceFor(row) : gallery) + observer;
      await writeFile(resolve(stage,'la-ladera/tests/people-wear-gallery.mjs'),source);
      if (mutation && (row.from || row.before)) {
        const path=resolve(out,'mutant-sources',row.id+'.mjs');await mkdir(dirname(path),{recursive:true});await writeFile(path,source);
        result.fixtureSource={path:posix(path),sha256LF:sha(source)};
      }
      const page=await browser.open('la-ladera/tests/people-wear-gallery.html?mutation='+sequence++,{ready:false});
      await page.waitFor('!!window.__wearCheck?.ready');await page.eval('__wearCheck.ready');
      if (row.entry === 'runtime') result.evidence=await page.eval('__wearCheck.validateRuntime()',240000);
      else if (row.entry === 'sharing') result.evidence=await page.eval('__wearCheck.validateGpuSharing()',240000);
      else if (row.entry === 'disposal') {
        result.preparation=await page.eval('__wearCheck.validateGpuSharing()',240000);
        result.evidence=await page.eval('__wearCheck.validateDisposal()',240000);
      } else if (row.entry === 'render' || row.entry === 'observed-render') {
        if (row.entry === 'observed-render') await page.eval('window.__wearMutationExpected='+JSON.stringify(row.render));
        result.evidence=await page.eval('__wearCheck.render('+JSON.stringify(row.render)+')',240000);
        if (row.entry === 'observed-render') { result.draws=await page.eval('__wearMutationDraws');observedSheet(result.evidence,result.draws,row.render); }
      } else if (row.entry === 'diagnostics') {
        if (mutation) {
          if (row.fault === 'network') await page.eval(mark(row.id)+"fetch('wear-browser-deliberately-missing-fixture.asset').then(r=>r.status)");
          else if (row.fault === 'exception') {
            await page.eval(mark(row.id)+"setTimeout(()=>{throw new Error('WEAR_BROWSER_EXPECTED_EXCEPTION')},0); true");
            for(let n=0;n<50 && !page.summary().errors.length;n++) await new Promise(resolve=>setTimeout(resolve,20));
          } else await page.eval(mark(row.id)+(row.fault === 'console-error' ? 'console.error' : 'console.warn')+"('WEAR_BROWSER_EXPECTED_DIAGNOSTIC'); true");
          await page.eval('true');
        }
        result.diagnostics=structuredClone(page.summary());diagnosticsGuard(result.diagnostics);
      } else throw new Error('unknown browser mutation entry '+row.entry);
      result.passed=true;
    }
    result.passed=true;
  } catch(error) { result.error=String(error?.stack ?? error); }
  if (row.entry !== 'fingerprint') {
    try { const markers=await browser.page.eval('window.__wearMutationApplied ?? []');result.markers=markers;result.applied=mutation && markers.includes(row.id); } catch(error) { result.markerError=String(error); }
    result.diagnostics ??= structuredClone(browser.page.summary());
  }
  result.seconds=(Date.now()-started)/1000;
  result.infrastructureError=!!result.error && /SyntaxError|ReferenceError|Failed to fetch|Chrome did not expose|CDP timeout|timeout waiting|net::ERR_|ERR_MODULE_NOT_FOUND|ENOENT/.test(result.error);
  result.expectedFailure=!!result.error && result.error.includes(row.error);
  result.killed=mutation && result.applied && result.expectedFailure && !result.infrastructureError;
  const path=resolve(out,mutation ? 'mutants' : 'controls',result.id+'.json');await write(path,result);
  return {...result,log:posix(path),sha256:sha(await readFile(path))};
}

try {
  browser=await launch({root:stage,width:2160,height:2926,gpu:'swiftshader'});
  report.renderer=await browser.renderer();
  for (const row of cases) {
    const key=controlKey(row);
    if (!controls.has(key)) {
      const control=await runCase(row,false);controls.set(key,control);report.controls.push(control);
      console.log(JSON.stringify({control:key,passed:control.passed,error:control.error}));
    }
    const control=controls.get(key);
    if (!control.passed || control.error) {
      report.mutants.push({id:row.id,test:row.test,killed:false,blocked:true,reason:'matching positive browser control did not pass'});
    } else {
      const result=await runCase(row,true);report.mutants.push(result);
      console.log(JSON.stringify({id:row.id,applied:result.applied,killed:result.killed,error:result.error?.split('\n')[0]}));
    }
    await write(resolve(out,'progress.json'),report);
  }
} catch(error) { report.failure=String(error?.stack ?? error); }
finally { if(browser) await browser.close(); }
try { const final=await snapshot();await write(resolve(out,'inputs-end.json'),final);report.inputsStable=JSON.stringify(final) === JSON.stringify(initial); }
catch(error) { report.inputsStable=false;report.inputFailure=String(error); }
report.tests=cases.length;report.mutantsExpected=cases.length;report.killed=report.mutants.filter(row=>row.killed).length;
report.ok=!report.failure && report.inputsStable && report.killed === cases.length && report.controls.every(row=>row.passed && !row.error);
report.complete=report.ok;report.finishedAt=new Date().toISOString();
await write(resolve(out,'report.json'),report);
console.log(JSON.stringify({ok:report.ok,complete:report.complete,tests:report.tests,killed:report.killed,inputsStable:report.inputsStable,failure:report.failure},null,2));
process.exitCode=report.ok ? 0 : 1;
