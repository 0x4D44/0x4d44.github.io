// Run every affirmative acceptance test once against a deliberately broken
// fixture/module. A mutation is killed only when its named test actually fails.
import './nice.mjs';
import { spawnSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const CASES = Object.freeze([
  ['W01', 'complete', 'remove a physical GLB'],
  ['W02', 'nan', 'write NaN into a POSITION float while re-pinning file SHA'],
  ['W03', 'accessor', 'extend POSITION count beyond its bufferView'],
  ['W04', 'uv', 'write UV=1.5 into the real binary'],
  ['W05', 'index', 'write an index equal to the vertex count'],
  ['W06', 'transform', 'reflect a scene-root scale'],
  ['W07', 'normal', 'zero an actual vertex normal'],
  ['W08', 'lod', 'remove a far root declaration'],
  ['W09', 'triangles', 'repeat near primitives 100 times with honest counts'],
  ['W10', 'pivot', 'rename an actual sail pivot'],
  ['W11', 'hash', 'stale the GLB SHA-256 pin'],
  ['W12', 'png', 'flip an atlas IDAT byte without repairing its CRC'],
  ['W13', 'draft', 'increase floating draft metadata without moving geometry'],
  ['W14', 'anchors', 'put a climb end below its start in both JSON sources'],
  ['W15', 'boot', 'register watersports in the boot manifest'],
  ['W16', 'instances', 'replace repeated plank/float mesh references with unique meshes'],
  ['W17', 'colourways', 'remove one requested sail colourway'],
  ['W18', 'textpin', 'change catalogue content after its LF hash was pinned'],
  ['W19', 'hull-exterior', 'reverse actual hull winding and normals together, preserving their agreement'],
  ['W20', 'sector', 'name the library from a module of the game that is not the sector\'s loader'],
  ['L01', 'line-end', 'mutate the catenary endpoint assignment'],
  ['L02', 'line-sag', 'discard 90 percent of requested slack'],
  ['L03', 'line-degenerate', 'divide the degenerate span branch by distance'],
  ['L04', 'line-bounds', 'remove the segment-count guard'],
  ['L05', 'line-buffer', 'allocate instead of reusing the supplied segment buffer'],
  ['V01', 'variant', 'mutate source UVs instead of cloning the affected geometry'],
]);

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const testFile = resolve(dirname(fileURLToPath(import.meta.url)), 'watersports-assets.test.mjs');
  const onlyAt = process.argv.indexOf('--only'), only = onlyAt < 0 ? null : new Set((process.argv[onlyAt + 1] ?? '').split(','));
  const cases = only ? CASES.filter(([id]) => only.has(id)) : CASES;
  if (!cases.length || (only && cases.length !== only.size)) { console.error('Unknown or empty --only test ids'); process.exit(2); }
  const cleanEnv = { ...process.env }; delete cleanEnv.WATERSPORTS_MUTATION;
  const baseline = spawnSync(process.execPath, ['--test-reporter=tap', '--test-name-pattern', `^(?:${cases.map(([id]) => id).join('|')}) `, testFile], {
    env: cleanEnv, encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], timeout: 120_000, maxBuffer: 5_000_000,
  });
  if (baseline.status !== 0 || !new RegExp(`# pass ${cases.length}\\b`).test(baseline.stdout ?? '')) {
    console.error(`BASELINE FAILED: mutations cannot count as killed without a passing control\n${baseline.stdout ?? ''}${baseline.stderr ?? ''}`); process.exit(1);
  }
  console.log(`BASELINE ${cases.length}/${cases.length} passed; Node ${process.version}`);
  let killed = 0;
  for (const [id, mutation, description] of cases) {
    const r = spawnSync(process.execPath, ['--test-reporter=tap', '--test-name-pattern', `^${id} `, testFile], {
      env: { ...process.env, WATERSPORTS_MUTATION: mutation }, encoding: 'utf8', windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'], timeout: 120_000, maxBuffer: 5_000_000,
    });
    const output = (r.stdout ?? '') + (r.stderr ?? '');
    const namedFailure = new RegExp(`not ok \\d+ - ${id} `).test(output);
    // W19 must reach its semantic assertion: a generic parser/winding failure
    // would not prove this particular inside-out-hull regression is caught.
    const semanticFailure = id !== 'W19' || /nearest exterior hull surface faces inward/.test(output);
    if (r.status !== 0 && namedFailure && semanticFailure && /# fail 1\b/.test(output)) {
      killed++; console.log(`KILLED ${id} ${mutation}: ${description}`);
    } else {
      console.error(`SURVIVED/INVALID ${id} ${mutation}: exit=${r.status}; ${r.error?.message ?? ''}\n${output}`);
    }
  }
  console.log(`MUTATIONS ${killed}/${cases.length} killed; Node ${process.version}`);
  process.exitCode = killed === cases.length ? 0 : 1;
}
