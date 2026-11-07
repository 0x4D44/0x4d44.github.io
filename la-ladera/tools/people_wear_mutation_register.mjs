import '../tests/nice.mjs';
import { register } from 'node:module';
import { readFileSync } from 'node:fs';

if (process.env.LADERA_WEAR_MUTATION) {
  const config = JSON.parse(readFileSync(process.env.LADERA_WEAR_MUTATION, 'utf8'));
  register('./people_wear_mutation_hook.mjs', import.meta.url, { data: config });
}
