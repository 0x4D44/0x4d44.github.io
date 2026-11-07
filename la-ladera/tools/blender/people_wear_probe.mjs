#!/usr/bin/env node
// Fast authoring diagnostic, deliberately separate from the release validator.
// All 32 clips at five phases + raw rest; never a complete clearance certificate.
import '../../tests/nice.mjs';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT, readWearGlb, inspectFit, safePath, adultIds } from './people_wear_validate.mjs';
import { readGlb } from './people_validate.mjs';
import { readPoseBank } from './people_wear_math.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const need = (ok, message) => { if (!ok) throw new Error(message); };

export async function probeWearPhases({ root = ROOT, group = 0, groups = 1, onProgress = null } = {}) {
  need(Number.isInteger(groups) && groups > 0 && Number.isInteger(group) && group >= 0 && group < groups, 'invalid diagnostic group');
  const metadataPath = resolve(root, 'wear/metadata.json'), metadataBytes = readFileSync(metadataPath), metadata = JSON.parse(metadataBytes);
  const peopleMetaPath = resolve(root, 'people/people_meta.json'), adults = adultIds(JSON.parse(readFileSync(peopleMetaPath)));
  need(Object.keys(metadata.fits).length === adults.length && adults.every(id => metadata.fits[id]), 'phase preflight requires every adult fit and no child fit');
  const ids = Object.keys(metadata.fits).filter((_, i) => i % groups === group);
  need(ids.length > 0, 'diagnostic group has no fits');
  const sourceFiles = [resolve(root, 'people/people.glb'), resolve(HERE, 'people_clips.json.gz'), resolve(HERE, 'people_contract.json'),
    resolve(HERE, 'people_wear_build.py'), resolve(HERE, 'people_wear_shapes.py'), resolve(HERE, 'people_wear_fit_faces.mjs'), resolve(HERE, 'people_wear_fit_targets.mjs'),
    resolve(HERE, 'people_build.py'), resolve(HERE, 'people_cast.py'), resolve(root, 'garments/prints.png'),
    resolve(HERE, 'people_wear_validate.mjs'), resolve(HERE, 'people_wear_math.mjs'), resolve(HERE, '../../js/people/wear_geometry.js'),
    resolve(HERE, '../../js/people/wear_pose.js'), resolve(HERE, '../../js/people/wear_correction.js'), resolve(HERE, '../../js/people/wear.js'), peopleMetaPath];
  const sourceHashes = sourceFiles.map(path => ({ path, sha256: sha(readFileSync(path)) }));
  const sourceGlb = readGlb(sourceFiles[0]), clips = readPoseBank();
  const samples = [{ clip: null, clipName: 'rest', time: 0 }, ...clips.flatMap(clip => [0, 0.25, 0.5, 0.75, 1].map(phase => ({ clip, clipName: clip.name, time: clip.duration * phase })))];
  const started = performance.now(), cpuStarted = process.cpuUsage(), fits = [], files = [];
  for (const id of ids) {
    const fit = metadata.fits[id], file = fit.file.startsWith('wear/') ? fit.file : `wear/${fit.file}`, path = safePath(root, file), doc = readWearGlb(path);
    need(fit.sha256 === doc.shippedSha256 && fit.bytes === doc.shippedBytes, `${id}: metadata does not describe the current shipped bytes`);
    files.push({ path: file, sha256: doc.shippedSha256, bytes: doc.shippedBytes });
    if (onProgress) onProgress({ phase: 'start', id, samples: samples.length });
    const start = performance.now();
    const result = await inspectFit(doc, fit, { id, sourceGlb, samples, issueLimit: 24,
      onProgress: onProgress ? state => onProgress({ phase: 'poses', id, poses: state.poses, samples: samples.length, issues: state.issues.length }) : null });
    result.milliseconds = performance.now() - start; fits.push(result);
    if (onProgress) onProgress({ phase: 'done', id, poses: result.poses, samples: samples.length, milliseconds: result.milliseconds, issues: result.issues.length });
  }
  need(sha(readFileSync(metadataPath)) === sha(metadataBytes), 'metadata changed during the diagnostic');
  for (const file of files) need(sha(readFileSync(safePath(root, file.path))) === file.sha256, `${file.path}: fit bytes changed during the diagnostic`);
  for (const source of sourceHashes) need(sha(readFileSync(source.path)) === source.sha256, `${source.path}: checker/source bytes changed during the diagnostic`);
  const cpu = process.cpuUsage(cpuStarted), issues = fits.flatMap(f => f.issues.map(issue => ({ fit: f.id, ...issue })));
  return { schema: 1, diagnosticOnly: true, complete: false, ok: issues.length === 0, group, groups, samplesPerFit: samples.length,
    requiredClipCount: 32, milliseconds: performance.now() - started, cpuMilliseconds: (cpu.user + cpu.system) / 1000,
    metadataSha256: sha(metadataBytes), sourceHashes, files, fits, issues };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), value = name => { const i = args.indexOf(name); return i < 0 ? null : args[i + 1]; };
  try {
    const report = await probeWearPhases({ group: Number(value('--group') ?? 0), groups: Number(value('--groups') ?? 1),
      onProgress: args.includes('--progress') ? row => console.error(JSON.stringify(row)) : null });
    if (value('--report')) writeFileSync(resolve(value('--report')), JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify({ diagnosticOnly: true, complete: false, ok: report.ok, group: report.group, fits: report.fits.length,
      samplesPerFit: report.samplesPerFit, milliseconds: report.milliseconds, issues: report.issues }));
    process.exitCode = report.ok ? 0 : 1;
  } catch (error) { console.error(error.stack ?? String(error)); process.exitCode = 1; }
}
