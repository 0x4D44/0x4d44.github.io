// Which copy of the site the tests drive.
//   PTB_SITE=<folder>   a site root that holds plan-to-build/index.html (a baseline copy, another worktree...). Default: this repository's root.
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));          // <repo>/plan-to-build/tests/lib
export const REPO = resolve(HERE, "..", "..", "..");
export const SITE = resolve(process.env.PTB_SITE || REPO);
export const PAGE = "plan-to-build/index.html";
export const TESTS = resolve(HERE, "..");                      // <repo>/plan-to-build/tests
