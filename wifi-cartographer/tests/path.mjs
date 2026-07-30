import { fileURLToPath } from 'node:url';

export function validatorRoot(moduleUrl, options) {
  return fileURLToPath(new URL('..', moduleUrl), options);
}
