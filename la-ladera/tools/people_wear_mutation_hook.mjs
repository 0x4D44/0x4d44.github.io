// An in-memory mutation applies to one reviewed implementation module only.
// Source files and generated artifacts remain untouched during the experiment.
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

let config;
export function initialize(data) { config = data; }
export async function load(url, context, nextLoad) {
  const loaded = await nextLoad(url, context);
  if (!config || !url.startsWith('file:')) return loaded;
  const path = fileURLToPath(url), changes = config.changes.filter(change => !change.kind && resolve(config.root, change.path) === path);
  if (!changes.length) return loaded;
  let source = typeof loaded.source === 'string' ? loaded.source : Buffer.from(loaded.source).toString('utf8');
  source = source.replace(/\r\n/g, '\n');
  for (const change of changes) {
    if (!change.from || source.split(change.from).length !== 2) throw new Error(`MUTATION_ANCHOR_MISMATCH: ${config.id}/${change.path}`);
    source = source.replace(change.from, change.to);
  }
  process.stderr.write(`[wear-mutation-applied:${config.id}:${config.changes.indexOf(changes[0])}]\n`);
  return { ...loaded, source };
}
