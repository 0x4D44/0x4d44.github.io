import { createHash } from "node:crypto";
import { readFile, stat, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const core = await readFile(resolve(ROOT, "rust/crates/darwin-core/src/lib.rs"), "utf8");
const wasmPath = resolve(ROOT, "pkg/darwin_wasm_bg.wasm");
const jsPath = resolve(ROOT, "pkg/darwin_wasm.js");
const wasm = await readFile(wasmPath);
const js = await readFile(jsPath);
const extract = (name, pattern) => {
  const match = core.match(pattern);
  if (!match) throw new Error(`Could not extract ${name} from darwin-core`);
  return match[1];
};
const info = {
  buildId: extract("BUILD_ID", /pub const BUILD_ID: &str = "([^"]+)"/),
  engineVersion: extract("ENGINE_VERSION", /pub const ENGINE_VERSION: &str = "([^"]+)"/),
  isaVersion: Number(extract("ISA_VERSION", /pub const ISA_VERSION: u16 = (\d+)/)),
  rngVersion: Number(extract("RNG_VERSION", /pub const RNG_VERSION: u16 = (\d+)/)),
  physicsVersion: Number(extract("PHYSICS_VERSION", /pub const PHYSICS_VERSION: u16 = (\d+)/)),
  saveVersion: Number(extract("SAVE_VERSION", /pub const SAVE_VERSION: u16 = (\d+)/)),
  wasmBytes: (await stat(wasmPath)).size,
  glueBytes: (await stat(jsPath)).size,
  wasmSha256: createHash("sha256").update(wasm).digest("hex"),
  glueSha256: createHash("sha256").update(js).digest("hex"),
  generated: true,
  toolchain: { rust: "1.88.0", wasmPack: "0.13.1", target: "web" },
};
await writeFile(resolve(ROOT, "pkg/build-info.json"), `${JSON.stringify(info, null, 2)}\n`);
