// Node module-resolution hook: maps the browser importmap ('three', 'three/addons/') onto the vendored files so the
// pure-data layers (plan, building plans, furnishing, physics) run under `node` with no bundler and no node_modules.
//   node --import ./la-ladera/tests/register.mjs your-test.mjs        (or: node --import ... --test file)
import { pathToFileURL, fileURLToPath } from 'node:url';
import { resolve as pathResolve, dirname } from 'node:path';

const V = pathResolve(dirname(fileURLToPath(import.meta.url)), '..', 'vendor', 'three');
const url = (rel) => pathToFileURL(pathResolve(V, rel)).href;

export async function resolve(specifier, context, nextResolve) {
  if (specifier === 'three') return { url: url('build/three.module.min.js'), shortCircuit: true };
  if (specifier.startsWith('three/addons/')) return { url: url('examples/jsm/' + specifier.slice('three/addons/'.length)), shortCircuit: true };
  return nextResolve(specifier, context);
}
