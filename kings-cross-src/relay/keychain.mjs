// Reads the Network Rail login from the macOS keychain, inside the relay process only.
//
// Store it once, in your own terminal (the password is prompted for, never echoed):
//   security add-generic-password -s kx-ntrod -a 'you@example.com' -w
//
// Nothing here returns, logs or puts the secret into an error message. The account name
// is found from the item's attributes (a call without -w, which prints no password), so
// no email address lives in the source.
import { execFile } from 'node:child_process';

const SECURITY = '/usr/bin/security';
export const DEFAULT_SERVICE = 'kx-ntrod';

function run(exec, args) {
  return new Promise((resolve, reject) => {
    exec(SECURITY, args, { timeout: 10_000, maxBuffer: 64 * 1024, encoding: 'utf8' }, (err, stdout) => {
      if (err) reject(new Error(`keychain: lookup failed (exit ${err.code ?? 'unknown'})`));
      else resolve(String(stdout));
    });
  });
}

export function parseAccount(attributes) {
  const m = /"acct"<blob>="([^"]*)"/.exec(attributes);
  return m ? m[1] : null;
}

export async function readCredentials({ service = DEFAULT_SERVICE, exec = execFile, platform = process.platform } = {}) {
  if (platform !== 'darwin') throw new Error('keychain: only macOS is supported');
  const attributes = await run(exec, ['find-generic-password', '-s', service]);
  const account = parseAccount(attributes);
  if (!account) throw new Error(`keychain: item "${service}" has no account name`);
  const secret = (await run(exec, ['find-generic-password', '-s', service, '-a', account, '-w'])).replace(/\r?\n$/, '');
  if (!secret) throw new Error(`keychain: item "${service}" has an empty password`);
  return { account, secret };
}
